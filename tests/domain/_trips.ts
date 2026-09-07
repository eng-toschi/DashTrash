/** Gerador de viagens válidas para os testes de propriedade. */
import fc from 'fast-check';
import { allocate } from '@/domain/money.js';
import type { TripExpense, TripLedger, TripSettlement } from '@/domain/balance.js';
import type { Share } from '@/domain/split.js';

/** Moeda-base BRL; taxas plausíveis de uma viagem real. */
export const RATES: Readonly<Record<string, number>> = {
  BRL: 1_000_000,
  USD: 5_400_000,
  EUR: 6_200_000,
  JPY: 37_000,
};

const CURRENCIES = Object.keys(RATES);

export function participantIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${String(i).padStart(2, '0')}`);
}

function sharesFor(amountCents: number, ids: readonly string[], weights: readonly number[]): Share[] {
  const entries = ids.map((id, i) => ({ id, weight: weights[i] ?? 1 }));
  const usable = entries.some((e) => e.weight > 0) ? entries : entries.map((e) => ({ ...e, weight: 1 }));
  return allocate(amountCents, usable).map((a) => ({ participantId: a.id, cents: a.cents }));
}

export const ledgerArbitrary = (): fc.Arbitrary<TripLedger> =>
  fc.integer({ min: 2, max: 8 }).chain((count) => {
    const ids = participantIds(count);

    const expense = fc
      .record({
        amountCents: fc.integer({ min: 1, max: 5_000_000 }),
        currency: fc.constantFrom(...CURRENCIES),
        paidBy: fc.constantFrom(...ids),
        participants: fc.subarray(ids, { minLength: 1 }),
        weights: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 8, maxLength: 8 }),
        iofPpm: fc.constantFrom(0, 11_000, 35_000),
      })
      .map((raw, index = 0): TripExpense => {
        const currency = raw.currency;
        return {
          id: `e${String(index)}`,
          amountCents: raw.amountCents,
          currency,
          fxRatePpm: RATES[currency] ?? 1_000_000,
          iofPpm: currency === 'BRL' ? 0 : raw.iofPpm,
          paidBy: raw.paidBy,
          shares: sharesFor(raw.amountCents, raw.participants, raw.weights),
        };
      });

    const settlement = fc
      .record({
        pair: fc.subarray(ids, { minLength: 2, maxLength: 2 }),
        amountCents: fc.integer({ min: 1, max: 1_000_000 }),
        currency: fc.constantFrom(...CURRENCIES),
      })
      .map((raw): TripSettlement => {
        const currency = raw.currency;
        return {
          id: 's',
          fromId: raw.pair[0] ?? ids[0] ?? 'p00',
          toId: raw.pair[1] ?? ids[1] ?? 'p01',
          amountCents: raw.amountCents,
          currency,
          fxRatePpm: RATES[currency] ?? 1_000_000,
        };
      });

    return fc.record({
      expenses: fc.array(expense, { maxLength: 25 }),
      settlements: fc.array(settlement, { maxLength: 5 }),
    }).map(({ expenses, settlements }) => ({
      baseCurrency: 'BRL',
      participantIds: ids,
      expenses: expenses.map((e, i) => ({ ...e, id: `e${String(i)}` })),
      settlements: settlements.map((s, i) => ({ ...s, id: `s${String(i)}` })),
    }));
  });
