import { describe, expect, it } from 'vitest';
import { computeBalances, totalSpent, type TripLedger } from '@/domain/balance';
import { sumCents } from '@/domain/money';
import { expenseTotalInBase, summarizeByCategory, summarizeTotal } from '@/domain/summary';

const despesas = [
  { category: 'lodging', amountCents: 96_000, currency: 'JPY', fxRatePpm: 37_000, iofPpm: 35_000 },
  { category: 'transport', amountCents: 4200, currency: 'JPY', fxRatePpm: 37_000, iofPpm: 35_000 },
  { category: 'restaurant', amountCents: 24_000, currency: 'BRL', fxRatePpm: 1_000_000 },
  { category: 'restaurant', amountCents: 6000, currency: 'BRL', fxRatePpm: 1_000_000 },
];

describe('resumo por categoria', () => {
  it('não precisa das partes da despesa para converter', () => {
    // REGRESSÃO: a tela de fechamento montava uma despesa com partes vazias só
    // para obter o total, e o invariante de `expenseInBase` derrubava a tela.
    expect(expenseTotalInBase(despesas[0]!, 'BRL')).toBe(367_632);
  });

  it('agrupa e ordena do maior para o menor', () => {
    expect(summarizeByCategory(despesas, 'BRL')).toEqual([
      { category: 'lodging', cents: 367_632 },
      { category: 'restaurant', cents: 30_000 },
      { category: 'transport', cents: 16_084 },
    ]);
  });

  it('as barras somam exatamente o gasto da viagem', () => {
    const porCategoria = summarizeByCategory(despesas, 'BRL');
    expect(sumCents(porCategoria.map((c) => c.cents))).toBe(summarizeTotal(despesas, 'BRL'));
  });

  it('bate com o total que o razão calcula', () => {
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana'],
      expenses: despesas.map((d, i) => ({
        id: `e${String(i)}`,
        amountCents: d.amountCents,
        currency: d.currency,
        fxRatePpm: d.fxRatePpm,
        iofPpm: d.iofPpm ?? 0,
        paidBy: 'ana',
        shares: [{ participantId: 'ana', cents: d.amountCents }],
      })),
      settlements: [],
    };

    expect(summarizeTotal(despesas, 'BRL')).toBe(totalSpent(ledger));
    expect(computeBalances(ledger).residualCents).toBe(0);
  });

  it('lista vazia devolve zero', () => {
    expect(summarizeByCategory([], 'BRL')).toEqual([]);
    expect(summarizeTotal([], 'BRL')).toBe(0);
  });
});
