import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeBalances, expenseInBase, totalSpent, type TripLedger } from '@/domain/balance';
import { convertCents } from '@/domain/fx';
import { sumCents } from '@/domain/money';
import { DomainError } from '@/domain/result';
import { ledgerArbitrary } from './_trips';

const BRL = (cents: number): { currency: string; fxRatePpm: number; amountCents: number } => ({
  currency: 'BRL',
  fxRatePpm: 1_000_000,
  amountCents: cents,
});

describe('saldos', () => {
  it('credita quem pagou e debita quem consumiu', () => {
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno', 'carla'],
      expenses: [
        {
          id: 'jantar',
          ...BRL(10_000),
          paidBy: 'ana',
          shares: [
            { participantId: 'ana', cents: 3334 },
            { participantId: 'bruno', cents: 3333 },
            { participantId: 'carla', cents: 3333 },
          ],
        },
      ],
      settlements: [],
    };

    const report = computeBalances(ledger);
    expect(report.balances).toEqual([
      { participantId: 'ana', cents: 6666 },
      { participantId: 'bruno', cents: -3333 },
      { participantId: 'carla', cents: -3333 },
    ]);
    expect(report.residualCents).toBe(0);
  });

  it('aceita pagador que não entrou na divisão', () => {
    // O táxi que só o Bruno e a Carla pegaram, mas quem pagou foi a Ana.
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno', 'carla'],
      expenses: [
        {
          id: 'taxi',
          ...BRL(3000),
          paidBy: 'ana',
          shares: [
            { participantId: 'bruno', cents: 1500 },
            { participantId: 'carla', cents: 1500 },
          ],
        },
      ],
      settlements: [],
    };

    expect(computeBalances(ledger).balances).toEqual([
      { participantId: 'ana', cents: 3000 },
      { participantId: 'bruno', cents: -1500 },
      { participantId: 'carla', cents: -1500 },
    ]);
  });

  it('mantém quem não gastou nada com saldo zero', () => {
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno', 'davi'],
      expenses: [
        {
          id: 'jantar',
          ...BRL(5000),
          paidBy: 'ana',
          shares: [
            { participantId: 'ana', cents: 2500 },
            { participantId: 'bruno', cents: 2500 },
          ],
        },
      ],
      settlements: [],
    };

    expect(computeBalances(ledger).balances).toContainEqual({ participantId: 'davi', cents: 0 });
  });

  it('acerto reduz o saldo dos dois lados', () => {
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno'],
      expenses: [
        {
          id: 'hotel',
          ...BRL(20_000),
          paidBy: 'ana',
          shares: [
            { participantId: 'ana', cents: 10_000 },
            { participantId: 'bruno', cents: 10_000 },
          ],
        },
      ],
      settlements: [
        { id: 'pix', fromId: 'bruno', toId: 'ana', amountCents: 4000, currency: 'BRL', fxRatePpm: 1_000_000 },
      ],
    };

    expect(computeBalances(ledger).balances).toEqual([
      { participantId: 'ana', cents: 6000 },
      { participantId: 'bruno', cents: -6000 },
    ]);
  });
});

describe('conversão de moeda dentro da despesa', () => {
  it('REGRESSÃO: reparte o total já convertido, em vez de converter parte por parte', () => {
    // 100 ienes, taxa 0,0375, divididos entre 3. Convertendo cada parte
    // separadamente daria 128 + 124 + 124 = 376, enquanto o total convertido é
    // 375: um centavo do nada, que desequilibraria o grupo (spec §9).
    const expense = {
      id: 'ramen',
      amountCents: 100,
      currency: 'JPY',
      fxRatePpm: 37_500,
      paidBy: 'ana',
      shares: [
        { participantId: 'ana', cents: 34 },
        { participantId: 'bruno', cents: 33 },
        { participantId: 'carla', cents: 33 },
      ],
    };

    const naive = expense.shares.map((s) => convertCents(s.cents, 'JPY', 'BRL', 37_500));
    expect(sumCents(naive)).toBe(376);

    const base = expenseInBase(expense, 'BRL');
    expect(base.totalCents).toBe(375);
    expect(sumCents(base.shares.map((s) => s.cents))).toBe(375);
  });

  it('fecha em zero numa viagem com quatro moedas', () => {
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno', 'carla'],
      expenses: [
        {
          id: 'hotel-tokyo',
          amountCents: 48_000,
          currency: 'JPY',
          fxRatePpm: 37_000,
          paidBy: 'ana',
          shares: [
            { participantId: 'ana', cents: 16_000 },
            { participantId: 'bruno', cents: 16_000 },
            { participantId: 'carla', cents: 16_000 },
          ],
        },
        {
          id: 'jantar-paris',
          amountCents: 8737,
          currency: 'EUR',
          fxRatePpm: 6_200_000,
          paidBy: 'bruno',
          shares: [
            { participantId: 'bruno', cents: 4369 },
            { participantId: 'carla', cents: 4368 },
          ],
        },
        {
          id: 'uber-ny',
          amountCents: 4133,
          currency: 'USD',
          fxRatePpm: 5_400_000,
          paidBy: 'carla',
          shares: [
            { participantId: 'ana', cents: 1378 },
            { participantId: 'bruno', cents: 1378 },
            { participantId: 'carla', cents: 1377 },
          ],
        },
      ],
      settlements: [],
    };

    const report = computeBalances(ledger);
    expect(report.residualCents).toBe(0);
    expect(sumCents(report.balances.map((b) => b.cents))).toBe(0);
  });

  it('soma o total gasto na moeda-base', () => {
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana'],
      expenses: [
        { id: 'a', ...BRL(5000), paidBy: 'ana', shares: [{ participantId: 'ana', cents: 5000 }] },
        {
          id: 'b',
          amountCents: 1000,
          currency: 'JPY',
          fxRatePpm: 37_000,
          paidBy: 'ana',
          shares: [{ participantId: 'ana', cents: 1000 }],
        },
      ],
      settlements: [],
    };

    expect(totalSpent(ledger)).toBe(5000 + 3700);
  });
});

describe('guardas de integridade', () => {
  const base = {
    baseCurrency: 'BRL',
    participantIds: ['ana', 'bruno'],
    settlements: [],
  };

  it('recusa despesa cujas partes não somam o total', () => {
    expect(() =>
      computeBalances({
        ...base,
        expenses: [
          { id: 'x', ...BRL(10_000), paidBy: 'ana', shares: [{ participantId: 'ana', cents: 9999 }] },
        ],
      }),
    ).toThrow(DomainError);
  });

  it('recusa participante que não está na viagem', () => {
    expect(() =>
      computeBalances({
        ...base,
        expenses: [
          { id: 'x', ...BRL(1000), paidBy: 'fantasma', shares: [{ participantId: 'ana', cents: 1000 }] },
        ],
      }),
    ).toThrow(DomainError);
  });

  it('recusa acerto de alguém para si mesmo', () => {
    expect(() =>
      computeBalances({
        ...base,
        expenses: [],
        settlements: [
          { id: 's', fromId: 'ana', toId: 'ana', amountCents: 100, currency: 'BRL', fxRatePpm: 1_000_000 },
        ],
      }),
    ).toThrow(DomainError);
  });
});

describe('invariante central', () => {
  it('PROPRIEDADE: em qualquer viagem, a soma dos saldos é exatamente zero', () => {
    fc.assert(
      fc.property(ledgerArbitrary(), (ledger) => {
        const report = computeBalances(ledger);
        expect(report.residualCents).toBe(0);
        expect(sumCents(report.balances.map((b) => b.cents))).toBe(0);
        return true;
      }),
      { numRuns: 400 },
    );
  });
});
