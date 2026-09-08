/**
 * Saldos da viagem (spec §9).
 *
 * Invariante: a soma de todos os saldos é EXATAMENTE zero. Todo o resto deste
 * arquivo existe para sustentar isso.
 *
 * O ponto delicado é a conversão de moeda. O caminho ingênuo — converter a parte
 * de cada pessoa individualmente — quebra o invariante: o pagador é creditado por
 * converter(total), enquanto os devedores são debitados por Σ converter(parte_i),
 * e essas duas contas diferem por alguns centavos de arredondamento. Numa viagem
 * de 3 semanas isso vira um saldo que não fecha e ninguém sabe explicar.
 *
 * A solução: converter o TOTAL uma vez e reparticionar esse total convertido
 * entre as pessoas, usando as partes originais como peso. Assim a soma das partes
 * em moeda-base é, por construção, igual ao total em moeda-base.
 */
import { convertCents, convertCentsWithSurcharge } from './fx';
import { allocate, sumCents, type CurrencyCode } from './money';
import { invariant } from './result';
import type { Share } from './split';

export interface TripExpense {
  readonly id: string;
  readonly amountCents: number;
  readonly currency: CurrencyCode;
  /** Taxa para a moeda-base, fixada no lançamento (§8). */
  readonly fxRatePpm: number;
  /** IOF em ppm, também congelado no lançamento (§8.1). Ausente = 0. */
  readonly iofPpm?: number;
  readonly paidBy: string;
  /** Partes na moeda da despesa; devem somar `amountCents`. */
  readonly shares: readonly Share[];
}

export interface TripSettlement {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountCents: number;
  readonly currency: CurrencyCode;
  readonly fxRatePpm: number;
}

export interface TripLedger {
  readonly baseCurrency: CurrencyCode;
  /** Todos os participantes, inclusive quem está zerado — define a ordem da saída. */
  readonly participantIds: readonly string[];
  readonly expenses: readonly TripExpense[];
  readonly settlements: readonly TripSettlement[];
}

export interface Balance {
  readonly participantId: string;
  /** > 0 tem a receber, < 0 deve. Sempre na moeda-base. */
  readonly cents: number;
}

export interface BalanceReport {
  readonly balances: readonly Balance[];
  /**
   * Deve ser sempre 0. Existe para o app poder mostrar a diferença em vez de
   * mentir, caso algum bug futuro quebre o invariante (§9).
   */
  readonly residualCents: number;
}

export interface ExpenseInBase {
  /** Custo real em moeda-base, IOF incluído. É o que o pagador desembolsou. */
  readonly totalCents: number;
  /** Quanto do total é IOF. Só para exibição. */
  readonly iofCents: number;
  readonly shares: readonly Share[];
}

/** Converte a despesa para a moeda-base preservando `Σ partes === total`. */
export function expenseInBase(expense: TripExpense, baseCurrency: CurrencyCode): ExpenseInBase {
  invariant(
    sumCents(expense.shares.map((s) => s.cents)) === expense.amountCents,
    `Despesa ${expense.id}: as partes não somam o total.`,
  );

  const iofPpm = expense.iofPpm ?? 0;
  const totalCents = convertCentsWithSurcharge(
    expense.amountCents,
    expense.currency,
    baseCurrency,
    expense.fxRatePpm,
    iofPpm,
  );
  const netCents = convertCents(expense.amountCents, expense.currency, baseCurrency, expense.fxRatePpm);

  // Reparticiona o total JÁ convertido — nunca converte parte por parte.
  // O IOF entra no total ANTES do rateio, então é dividido na mesma proporção:
  // quem consumiu mais paga mais imposto, e o pagador é reembolsado pelo que a
  // fatura dele vai cobrar de verdade.
  const allocated = allocate(
    totalCents,
    expense.shares.map((s) => ({ id: s.participantId, weight: s.cents })),
  );

  return {
    totalCents,
    iofCents: totalCents - netCents,
    shares: allocated.map((a) => ({ participantId: a.id, cents: a.cents })),
  };
}

export function settlementInBase(settlement: TripSettlement, baseCurrency: CurrencyCode): number {
  return convertCents(settlement.amountCents, settlement.currency, baseCurrency, settlement.fxRatePpm);
}

export function computeBalances(ledger: TripLedger): BalanceReport {
  const known = new Set(ledger.participantIds);
  const totals = new Map<string, number>(ledger.participantIds.map((id) => [id, 0]));

  const credit = (id: string, cents: number): void => {
    invariant(known.has(id), `Participante desconhecido na viagem: ${id}`);
    totals.set(id, (totals.get(id) ?? 0) + cents);
  };

  for (const expense of ledger.expenses) {
    const base = expenseInBase(expense, ledger.baseCurrency);
    credit(expense.paidBy, base.totalCents);
    for (const share of base.shares) credit(share.participantId, -share.cents);
  }

  for (const settlement of ledger.settlements) {
    invariant(settlement.fromId !== settlement.toId, `Acerto ${settlement.id} de alguém para si mesmo.`);
    const cents = settlementInBase(settlement, ledger.baseCurrency);
    credit(settlement.fromId, cents);
    credit(settlement.toId, -cents);
  }

  const balances = ledger.participantIds.map((participantId) => ({
    participantId,
    cents: totals.get(participantId) ?? 0,
  }));

  return { balances, residualCents: sumCents(balances.map((b) => b.cents)) };
}

/** Total gasto na viagem, em moeda-base. Acertos não entram: não são despesa. */
/**
 * Quanto ainda precisa mudar de mão para a viagem fechar.
 *
 * É a soma dos saldos POSITIVOS: os negativos são a mesma dívida vista do outro
 * lado, e somar os dois dá sempre zero — que é a única coisa que a soma completa
 * consegue dizer. Uma viagem encerrada com este número em zero está quitada; com
 * ele acima de zero, alguém ainda deve a alguém, e a tela precisa dizer isso em
 * vez de só carimbar "encerrada".
 */
export function outstandingCents(balances: readonly Balance[]): number {
  return balances.reduce((total, b) => total + Math.max(0, b.cents), 0);
}

export function totalSpent(ledger: TripLedger): number {
  return sumCents(ledger.expenses.map((e) => expenseInBase(e, ledger.baseCurrency).totalCents));
}

/** Quanto a viagem pagou de IOF, para a linha do fechamento. */
export function totalIof(ledger: TripLedger): number {
  return sumCents(ledger.expenses.map((e) => expenseInBase(e, ledger.baseCurrency).iofCents));
}
