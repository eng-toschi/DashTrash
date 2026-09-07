import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeBalances, type TripLedger } from '@/domain/balance.js';
import { sumCents } from '@/domain/money.js';
import { DomainError } from '@/domain/result.js';
import { applyTransfers, computeRealDebts, simplifyDebts } from '@/domain/settle.js';
import { ledgerArbitrary } from './_trips.js';

const zeroed = (ledger: TripLedger, transfers: readonly { fromId: string; toId: string; cents: number }[]): boolean =>
  applyTransfers(computeBalances(ledger).balances, transfers).every((b) => b.cents === 0);

describe('simplifyDebts', () => {
  it('casa o maior devedor com o maior credor', () => {
    const transfers = simplifyDebts([
      { participantId: 'ana', cents: 10_000 },
      { participantId: 'bruno', cents: -6000 },
      { participantId: 'carla', cents: -4000 },
    ]);

    expect(transfers).toEqual([
      { fromId: 'bruno', toId: 'ana', cents: 6000 },
      { fromId: 'carla', toId: 'ana', cents: 4000 },
    ]);
  });

  it('não gera transferência para quem já está zerado', () => {
    const transfers = simplifyDebts([
      { participantId: 'ana', cents: 5000 },
      { participantId: 'bruno', cents: -5000 },
      { participantId: 'carla', cents: 0 },
    ]);

    expect(transfers).toEqual([{ fromId: 'bruno', toId: 'ana', cents: 5000 }]);
  });

  it('devolve lista vazia quando ninguém deve nada', () => {
    expect(simplifyDebts([{ participantId: 'ana', cents: 0 }])).toEqual([]);
  });

  it('recusa saldos que não somam zero em vez de inventar um fechamento', () => {
    expect(() =>
      simplifyDebts([
        { participantId: 'ana', cents: 100 },
        { participantId: 'bruno', cents: -50 },
      ]),
    ).toThrow(DomainError);
  });

  it('desempata credores de mesmo valor pelo id, nas duas direções', () => {
    const transfers = simplifyDebts([
      { participantId: 'zeca', cents: 5000 },
      { participantId: 'ana', cents: 5000 },
      { participantId: 'bruno', cents: -10_000 },
    ]);

    expect(transfers[0]?.toId).toBe('ana');
    expect(transfers[1]?.toId).toBe('zeca');
  });

  it('sugere as mesmas transferências independente da ordem da lista', () => {
    const balances = [
      { participantId: 'ana', cents: 3000 },
      { participantId: 'bruno', cents: 3000 },
      { participantId: 'carla', cents: -6000 },
    ];

    // Empate entre dois credores: o desempate pelo id é o que faz dois
    // celulares mostrarem exatamente a mesma sugestão (spec §9).
    expect(simplifyDebts([...balances].reverse())).toEqual(simplifyDebts(balances));
  });
});

describe('dívidas reais vs. simplificado', () => {
  const ledger: TripLedger = {
    baseCurrency: 'BRL',
    participantIds: ['ana', 'bruno', 'carla'],
    expenses: [
      {
        id: 'ana-pagou-pelo-bruno',
        amountCents: 10_000,
        currency: 'BRL',
        fxRatePpm: 1_000_000,
        paidBy: 'ana',
        shares: [{ participantId: 'bruno', cents: 10_000 }],
      },
      {
        id: 'bruno-pagou-pela-carla',
        amountCents: 10_000,
        currency: 'BRL',
        fxRatePpm: 1_000_000,
        paidBy: 'bruno',
        shares: [{ participantId: 'carla', cents: 10_000 }],
      },
    ],
    settlements: [],
  };

  it('simplificado corta o intermediário: Carla paga direto à Ana', () => {
    const transfers = simplifyDebts(computeBalances(ledger).balances);
    expect(transfers).toEqual([{ fromId: 'carla', toId: 'ana', cents: 10_000 }]);
  });

  it('dívidas reais respeita quem dividiu com quem', () => {
    // Ninguém paga a quem não dividiu nada — a Carla não deve nada à Ana.
    expect(computeRealDebts(ledger)).toEqual([
      { fromId: 'bruno', toId: 'ana', cents: 10_000 },
      { fromId: 'carla', toId: 'bruno', cents: 10_000 },
    ]);
  });

  it('os dois modos quitam exatamente os mesmos saldos', () => {
    expect(zeroed(ledger, simplifyDebts(computeBalances(ledger).balances))).toBe(true);
    expect(zeroed(ledger, computeRealDebts(ledger))).toBe(true);
  });

  it('não sugere transferência quando as dívidas do par se anulam', () => {
    const mutuo: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno'],
      expenses: [
        {
          id: 'ana-pagou',
          amountCents: 5000,
          currency: 'BRL',
          fxRatePpm: 1_000_000,
          paidBy: 'ana',
          shares: [{ participantId: 'bruno', cents: 5000 }],
        },
        {
          id: 'bruno-pagou',
          amountCents: 5000,
          currency: 'BRL',
          fxRatePpm: 1_000_000,
          paidBy: 'bruno',
          shares: [{ participantId: 'ana', cents: 5000 }],
        },
      ],
      settlements: [],
    };

    expect(computeRealDebts(mutuo)).toEqual([]);
    expect(simplifyDebts(computeBalances(mutuo).balances)).toEqual([]);
  });

  it('dívidas reais compensa o par nos dois sentidos', () => {
    const mutual: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno'],
      expenses: [
        {
          id: 'ana-pagou',
          amountCents: 8000,
          currency: 'BRL',
          fxRatePpm: 1_000_000,
          paidBy: 'ana',
          shares: [{ participantId: 'bruno', cents: 8000 }],
        },
        {
          id: 'bruno-pagou',
          amountCents: 3000,
          currency: 'BRL',
          fxRatePpm: 1_000_000,
          paidBy: 'bruno',
          shares: [{ participantId: 'ana', cents: 3000 }],
        },
      ],
      settlements: [],
    };

    expect(computeRealDebts(mutual)).toEqual([{ fromId: 'bruno', toId: 'ana', cents: 5000 }]);
  });
});

describe('fechamento de uma viagem de verdade', () => {
  // 4 pessoas, 3 moedas, subgrupos diferentes em cada despesa e um acerto
  // parcial no meio — o cenário que o app precisa fechar no último dia.
  const ledger: TripLedger = {
    baseCurrency: 'BRL',
    participantIds: ['ana', 'bruno', 'carla', 'davi'],
    expenses: [
      {
        id: 'airbnb-paris',
        amountCents: 120_000,
        currency: 'EUR',
        fxRatePpm: 6_200_000,
        paidBy: 'ana',
        shares: [
          { participantId: 'ana', cents: 30_000 },
          { participantId: 'bruno', cents: 30_000 },
          { participantId: 'carla', cents: 30_000 },
          { participantId: 'davi', cents: 30_000 },
        ],
      },
      {
        id: 'aluguel-carro',
        amountCents: 48_000,
        currency: 'EUR',
        fxRatePpm: 6_200_000,
        paidBy: 'bruno',
        // O Davi não dirigiu nem andou no carro.
        shares: [
          { participantId: 'ana', cents: 16_000 },
          { participantId: 'bruno', cents: 16_000 },
          { participantId: 'carla', cents: 16_000 },
        ],
      },
      {
        id: 'restaurante',
        amountCents: 21_050,
        currency: 'EUR',
        fxRatePpm: 6_200_000,
        paidBy: 'carla',
        shares: [
          { participantId: 'ana', cents: 5263 },
          { participantId: 'bruno', cents: 5263 },
          { participantId: 'carla', cents: 5262 },
          { participantId: 'davi', cents: 5262 },
        ],
      },
      {
        id: 'uber',
        amountCents: 4500,
        currency: 'USD',
        fxRatePpm: 5_400_000,
        paidBy: 'davi',
        shares: [
          { participantId: 'bruno', cents: 2250 },
          { participantId: 'davi', cents: 2250 },
        ],
      },
      {
        id: 'hotel-tokyo',
        amountCents: 96_000,
        currency: 'JPY',
        fxRatePpm: 37_000,
        paidBy: 'ana',
        shares: [
          { participantId: 'ana', cents: 24_000 },
          { participantId: 'bruno', cents: 24_000 },
          { participantId: 'carla', cents: 24_000 },
          { participantId: 'davi', cents: 24_000 },
        ],
      },
      {
        id: 'taxi-tokyo',
        amountCents: 4200,
        currency: 'JPY',
        fxRatePpm: 37_000,
        paidBy: 'bruno',
        shares: [
          { participantId: 'ana', cents: 2100 },
          { participantId: 'bruno', cents: 2100 },
        ],
      },
    ],
    settlements: [
      { id: 'pix-davi', fromId: 'davi', toId: 'ana', amountCents: 50_000, currency: 'BRL', fxRatePpm: 1_000_000 },
    ],
  };

  it('os saldos fecham em zero', () => {
    const report = computeBalances(ledger);
    expect(report.residualCents).toBe(0);
    expect(sumCents(report.balances.map((b) => b.cents))).toBe(0);
  });

  it('o fechamento simplificado quita todo mundo com no máximo n-1 transferências', () => {
    const transfers = simplifyDebts(computeBalances(ledger).balances);
    expect(transfers.length).toBeLessThanOrEqual(ledger.participantIds.length - 1);
    expect(transfers.every((t) => t.cents > 0)).toBe(true);
    expect(zeroed(ledger, transfers)).toBe(true);
  });

  it('o fechamento por dívidas reais também quita todo mundo', () => {
    expect(zeroed(ledger, computeRealDebts(ledger))).toBe(true);
  });

  it('o acerto parcial reduz a dívida sem apagá-la', () => {
    const semAcerto = computeBalances({ ...ledger, settlements: [] });
    const comAcerto = computeBalances(ledger);
    const davi = (bs: readonly { participantId: string; cents: number }[]): number =>
      bs.find((b) => b.participantId === 'davi')?.cents ?? 0;

    expect(davi(comAcerto.balances)).toBe(davi(semAcerto.balances) + 50_000);
    expect(davi(comAcerto.balances)).toBeLessThan(0);
  });
});

describe('propriedades do fechamento', () => {
  it('PROPRIEDADE: simplificado zera todo mundo, com no máximo n-1 transferências', () => {
    fc.assert(
      fc.property(ledgerArbitrary(), (ledger) => {
        const transfers = simplifyDebts(computeBalances(ledger).balances);
        expect(transfers.length).toBeLessThanOrEqual(ledger.participantIds.length - 1);
        expect(transfers.every((t) => t.cents > 0)).toBe(true);
        expect(zeroed(ledger, transfers)).toBe(true);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('PROPRIEDADE: dívidas reais zera todo mundo', () => {
    fc.assert(
      fc.property(ledgerArbitrary(), (ledger) => {
        expect(zeroed(ledger, computeRealDebts(ledger))).toBe(true);
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it('PROPRIEDADE: dívidas reais gera no máximo uma transferência por par', () => {
    fc.assert(
      fc.property(ledgerArbitrary(), (ledger) => {
        const transfers = computeRealDebts(ledger);
        const pairs = transfers.map((t) => [t.fromId, t.toId].sort().join('|'));
        expect(new Set(pairs).size).toBe(pairs.length);
        expect(transfers.every((t) => t.cents > 0)).toBe(true);
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('o simplificado NÃO garante menos transferências que as dívidas reais', () => {
    // Contraexemplo real, encontrado pelos testes de propriedade: o guloso é uma
    // heurística, não o ótimo. Aqui ele gera 5 transferências onde as dívidas
    // reais resolvem em 4. Importa para o texto da UI: o modo simplificado
    // não pode prometer "sempre menos transferências".
    const balances = [
      { participantId: 'p00', cents: 5_087_675 },
      { participantId: 'p01', cents: 1_260_409 },
      { participantId: 'p02', cents: 4_556_585 },
      { participantId: 'p05', cents: -4_556_585 },
      { participantId: 'p06', cents: -2_840_221 },
      { participantId: 'p07', cents: -3_507_863 },
    ];

    const transfers = simplifyDebts(balances);
    expect(transfers).toHaveLength(5);
    expect(applyTransfers(balances, transfers).every((b) => b.cents === 0)).toBe(true);
  });
});
