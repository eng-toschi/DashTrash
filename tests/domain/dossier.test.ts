import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildDossier, dossierChecks, type DossierMeta } from '@/domain/dossier';
import { computeBalances, type TripLedger } from '@/domain/balance';
import { simplifyDebts } from '@/domain/settle';
import { sumCents } from '@/domain/money';
import { ledgerArbitrary } from '../db/../domain/_trips';

const ledger: TripLedger = {
  baseCurrency: 'BRL',
  participantIds: ['ana', 'bruno', 'carla'],
  expenses: [
    {
      id: 'hotel',
      amountCents: 96_000,
      currency: 'JPY',
      fxRatePpm: 37_000,
      iofPpm: 35_000,
      paidBy: 'ana',
      shares: [
        { participantId: 'ana', cents: 32_000 },
        { participantId: 'bruno', cents: 32_000 },
        { participantId: 'carla', cents: 32_000 },
      ],
    },
    {
      id: 'taxi',
      amountCents: 6000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      paidBy: 'bruno',
      shares: [
        { participantId: 'bruno', cents: 3000 },
        { participantId: 'carla', cents: 3000 },
      ],
    },
  ],
  settlements: [
    {
      id: 'pix1',
      fromId: 'carla',
      toId: 'ana',
      amountCents: 10_000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
    },
  ],
};

const meta: DossierMeta = {
  tripName: 'Japão',
  startsOn: '2026-03-12',
  endsOn: '2026-03-26',
  generatedOn: '2026-09-08',
  names: { ana: 'Ana', bruno: 'Bruno', carla: 'Carla' },
  expenses: {
    hotel: { description: 'Hotel Shinjuku', category: 'lodging', spentOn: '2026-03-13' },
    taxi: { description: 'Táxi', category: 'transport', spentOn: '2026-03-12' },
  },
  settlements: { pix1: '2026-03-27' },
};

describe('dossiê da viagem', () => {
  const dossier = buildDossier(ledger, meta);

  it('traz o total, o IOF e a média por pessoa', () => {
    expect(dossier.totalCents).toBe(367_632 + 6000);
    expect(dossier.iofCents).toBe(12_432);
    expect(dossier.perPersonCents).toBe(Math.round((367_632 + 6000) / 3));
  });

  it('mostra, por pessoa, o que desembolsou e o que consumiu', () => {
    const ana = dossier.people.find((p) => p.name === 'Ana');
    expect(ana?.paidCents).toBe(367_632);
    expect(ana?.shareCents).toBe(122_544);
    expect(ana?.settledInCents).toBe(10_000);

    const carla = dossier.people.find((p) => p.name === 'Carla');
    expect(carla?.paidCents).toBe(0);
    expect(carla?.settledOutCents).toBe(10_000);
  });

  it('lista as despesas em ordem de data, com nomes em vez de identificadores', () => {
    expect(dossier.expenses.map((e) => e.description)).toEqual(['Táxi', 'Hotel Shinjuku']);
    expect(dossier.expenses[1]?.payerName).toBe('Ana');
    expect(dossier.expenses[1]?.participantNames).toEqual(['Ana', 'Bruno', 'Carla']);
  });

  it('separa por moeda, guardando o valor original e o convertido', () => {
    const iene = dossier.currencies.find((c) => c.currency === 'JPY');
    expect(iene).toEqual({ currency: 'JPY', amountCents: 96_000, baseCents: 367_632, count: 1 });
  });

  it('registra os acertos já pagos e o que ainda falta', () => {
    expect(dossier.settlements).toHaveLength(1);
    expect(dossier.settlements[0]?.fromName).toBe('Carla');
    expect(dossier.remaining.length).toBeGreaterThan(0);
    expect(dossier.closed).toBe(false);
  });

  it('AS PARTES FECHAM COM O TOTAL — é o que o documento promete', () => {
    // O dossiê é o que as pessoas guardam e conferem meses depois. Se as
    // categorias não somarem o total, a conta inteira perde a credibilidade.
    const checks = dossierChecks(dossier);
    expect(checks).toEqual({
      categoriesMatchTotal: true,
      currenciesMatchTotal: true,
      balancesSumToZero: true,
    });
    expect(sumCents(dossier.categories.map((c) => c.cents))).toBe(dossier.totalCents);
  });

  it('marca a viagem como fechada quando os acertos pendentes são pagos', () => {
    // Paga exatamente o que o próprio app sugere e confere que o dossiê passa a
    // dizer que fechou — é o estado em que o documento vira o registro final.
    const pendentes = simplifyDebts(computeBalances(ledger).balances);
    const quitado = buildDossier(
      {
        ...ledger,
        settlements: [
          ...ledger.settlements,
          ...pendentes.map((transfer, index) => ({
            id: `quita${String(index)}`,
            fromId: transfer.fromId,
            toId: transfer.toId,
            amountCents: transfer.cents,
            currency: 'BRL',
            fxRatePpm: 1_000_000,
          })),
        ],
      },
      meta,
    );

    expect(quitado.remaining).toEqual([]);
    expect(quitado.closed).toBe(true);
    expect(quitado.people.every((p) => p.balanceCents === 0)).toBe(true);
  });

  it('PROPRIEDADE: em qualquer viagem, o dossiê fecha', () => {
    fc.assert(
      fc.property(ledgerArbitrary(), (random) => {
        const built = buildDossier(random, {
          tripName: 'Aleatória',
          startsOn: null,
          endsOn: null,
          generatedOn: '2026-09-08',
          names: Object.fromEntries(random.participantIds.map((id) => [id, id])),
          expenses: {},
          settlements: {},
        });
        expect(dossierChecks(built)).toEqual({
          categoriesMatchTotal: true,
          currenciesMatchTotal: true,
          balancesSumToZero: true,
        });
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
