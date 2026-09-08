/**
 * Resumos do fechamento (spec §11.8).
 *
 * Existe porque a tela de fechamento fabricava uma despesa com a lista de
 * partes vazia só para obter o total convertido — e isso viola o invariante de
 * `expenseInBase`, derrubando a tela. O total de uma despesa não precisa das
 * partes; só do valor, da moeda, da taxa e do IOF.
 */
import { paidAmount } from './payment';
import type { CurrencyCode } from './money';
import { sumCents } from './money';

export interface ConvertibleExpense {
  readonly category: string;
  readonly amountCents: number;
  readonly currency: CurrencyCode;
  readonly fxRatePpm: number;
  readonly iofPpm?: number;
}

export interface CategoryTotal {
  readonly category: string;
  readonly cents: number;
}

/** Custo real de uma despesa em moeda-base, IOF incluído, sem precisar das partes. */
export function expenseTotalInBase(expense: ConvertibleExpense, baseCurrency: CurrencyCode): number {
  return paidAmount(
    expense.amountCents,
    expense.currency,
    baseCurrency,
    expense.fxRatePpm,
    expense.iofPpm ?? 0,
  ).totalCents;
}

/** Gasto por categoria, do maior para o menor. */
export function summarizeByCategory(
  expenses: readonly ConvertibleExpense[],
  baseCurrency: CurrencyCode,
): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    const cents = expenseTotalInBase(expense, baseCurrency);
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + cents);
  }

  return [...totals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => (b.cents === a.cents ? (a.category < b.category ? -1 : 1) : b.cents - a.cents));
}

/** Total geral, para a tela conferir que as barras somam o gasto da viagem. */
export function summarizeTotal(
  expenses: readonly ConvertibleExpense[],
  baseCurrency: CurrencyCode,
): number {
  return sumCents(expenses.map((expense) => expenseTotalInBase(expense, baseCurrency)));
}
