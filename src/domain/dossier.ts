/**
 * Dossiê da viagem: o resumo que sobra depois que todo mundo se despede.
 *
 * É montado por uma função pura porque é o documento que as pessoas vão guardar
 * e conferir meses depois — se ele discordar do que o app mostrou, a confiança
 * acaba. Os números saem exatamente das mesmas contas que fecham os saldos.
 */
import { computeBalances, expenseInBase, totalIof, totalSpent, type TripLedger } from './balance';
import { convertCents } from './fx';
import { sumCents, type CurrencyCode } from './money';
import { simplifyDebts, type Transfer } from './settle';
import { summarizeByCategory, type CategoryTotal } from './summary';

export interface DossierMeta {
  readonly tripName: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly generatedOn: string;
  /** Nome de cada participante, por id. */
  readonly names: Readonly<Record<string, string>>;
  /** Descrição, categoria, quando e onde de cada despesa, por id. */
  readonly expenses: Readonly<
    Record<
      string,
      {
        description: string;
        category: string;
        spentOn: string;
        /** "21:04", quando a despesa foi lançada com hora. */
        timeLabel?: string | undefined;
        placeLabel?: string | undefined;
      }
    >
  >;
  /** Data de cada acerto já registrado, por id. */
  readonly settlements: Readonly<Record<string, string>>;
}

export interface DossierPerson {
  readonly name: string;
  /** Quanto desembolsou em despesas. */
  readonly paidCents: number;
  /** Quanto consumiu, isto é, a parte dele nas despesas. */
  readonly shareCents: number;
  /** Acertos que pagou e que recebeu, já registrados. */
  readonly settledOutCents: number;
  readonly settledInCents: number;
  readonly balanceCents: number;
}

export interface DossierExpense {
  readonly spentOn: string;
  readonly timeLabel: string | undefined;
  readonly placeLabel: string | undefined;
  readonly description: string;
  readonly category: string;
  readonly payerName: string;
  readonly amountCents: number;
  readonly currency: CurrencyCode;
  readonly baseCents: number;
  readonly iofCents: number;
  readonly participantNames: readonly string[];
}

export interface DossierSettlement {
  readonly settledOn: string;
  readonly fromName: string;
  readonly toName: string;
  readonly amountCents: number;
  readonly currency: CurrencyCode;
  readonly baseCents: number;
}

export interface CurrencyTotal {
  readonly currency: CurrencyCode;
  readonly amountCents: number;
  readonly baseCents: number;
  readonly count: number;
}

export interface TripDossier {
  readonly tripName: string;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly generatedOn: string;
  readonly baseCurrency: CurrencyCode;
  readonly totalCents: number;
  readonly iofCents: number;
  readonly perPersonCents: number;
  readonly categories: readonly CategoryTotal[];
  readonly currencies: readonly CurrencyTotal[];
  readonly people: readonly DossierPerson[];
  readonly expenses: readonly DossierExpense[];
  readonly settlements: readonly DossierSettlement[];
  /** O que ainda falta pagar. Vazio quando a viagem fechou de verdade. */
  readonly remaining: readonly { fromName: string; toName: string; cents: number }[];
  readonly closed: boolean;
}

function nameOf(meta: DossierMeta, id: string): string {
  return meta.names[id] ?? '—';
}

export function buildDossier(ledger: TripLedger, meta: DossierMeta): TripDossier {
  const report = computeBalances(ledger);
  const balances = new Map(report.balances.map((b) => [b.participantId, b.cents]));

  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const settledOut = new Map<string, number>();
  const settledIn = new Map<string, number>();
  const byCurrency = new Map<CurrencyCode, { amountCents: number; baseCents: number; count: number }>();

  const expenses: DossierExpense[] = ledger.expenses.map((expense) => {
    const base = expenseInBase(expense, ledger.baseCurrency);
    paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + base.totalCents);
    for (const part of base.shares) {
      share.set(part.participantId, (share.get(part.participantId) ?? 0) + part.cents);
    }

    const current = byCurrency.get(expense.currency) ?? { amountCents: 0, baseCents: 0, count: 0 };
    byCurrency.set(expense.currency, {
      amountCents: current.amountCents + expense.amountCents,
      baseCents: current.baseCents + base.totalCents,
      count: current.count + 1,
    });

    const info = meta.expenses[expense.id];
    return {
      spentOn: info?.spentOn ?? '',
      timeLabel: info?.timeLabel,
      placeLabel: info?.placeLabel,
      description: info?.description ?? '—',
      category: info?.category ?? 'other',
      payerName: nameOf(meta, expense.paidBy),
      amountCents: expense.amountCents,
      currency: expense.currency,
      baseCents: base.totalCents,
      iofCents: base.iofCents,
      participantNames: base.shares
        .filter((part) => part.cents !== 0)
        .map((part) => nameOf(meta, part.participantId)),
    };
  });

  const settlements: DossierSettlement[] = ledger.settlements.map((settlement) => {
    const baseCents = convertCents(
      settlement.amountCents,
      settlement.currency,
      ledger.baseCurrency,
      settlement.fxRatePpm,
    );
    settledOut.set(settlement.fromId, (settledOut.get(settlement.fromId) ?? 0) + baseCents);
    settledIn.set(settlement.toId, (settledIn.get(settlement.toId) ?? 0) + baseCents);

    return {
      settledOn: meta.settlements[settlement.id] ?? '',
      fromName: nameOf(meta, settlement.fromId),
      toName: nameOf(meta, settlement.toId),
      amountCents: settlement.amountCents,
      currency: settlement.currency,
      baseCents,
    };
  });

  const remaining: Transfer[] = simplifyDebts(report.balances);
  const total = totalSpent(ledger);

  return {
    tripName: meta.tripName,
    startsOn: meta.startsOn,
    endsOn: meta.endsOn,
    generatedOn: meta.generatedOn,
    baseCurrency: ledger.baseCurrency,
    totalCents: total,
    iofCents: totalIof(ledger),
    perPersonCents:
      ledger.participantIds.length === 0 ? 0 : Math.round(total / ledger.participantIds.length),
    categories: summarizeByCategory(
      ledger.expenses.map((expense) => ({
        category: meta.expenses[expense.id]?.category ?? 'other',
        amountCents: expense.amountCents,
        currency: expense.currency,
        fxRatePpm: expense.fxRatePpm,
        iofPpm: expense.iofPpm ?? 0,
      })),
      ledger.baseCurrency,
    ),
    currencies: [...byCurrency.entries()]
      .map(([currency, totals]) => ({ currency, ...totals }))
      .sort((a, b) => b.baseCents - a.baseCents),
    people: ledger.participantIds.map((id) => ({
      name: nameOf(meta, id),
      paidCents: paid.get(id) ?? 0,
      shareCents: share.get(id) ?? 0,
      settledOutCents: settledOut.get(id) ?? 0,
      settledInCents: settledIn.get(id) ?? 0,
      balanceCents: balances.get(id) ?? 0,
    })),
    expenses: [...expenses].sort((a, b) => (a.spentOn < b.spentOn ? -1 : a.spentOn > b.spentOn ? 1 : 0)),
    settlements,
    remaining: remaining.map((transfer) => ({
      fromName: nameOf(meta, transfer.fromId),
      toName: nameOf(meta, transfer.toId),
      cents: transfer.cents,
    })),
    closed: remaining.length === 0,
  };
}

/** Conferência que o próprio documento carrega: as partes fecham com o total. */
export function dossierChecks(dossier: TripDossier): {
  categoriesMatchTotal: boolean;
  currenciesMatchTotal: boolean;
  balancesSumToZero: boolean;
} {
  return {
    categoriesMatchTotal: sumCents(dossier.categories.map((c) => c.cents)) === dossier.totalCents,
    currenciesMatchTotal: sumCents(dossier.currencies.map((c) => c.baseCents)) === dossier.totalCents,
    balancesSumToZero: sumCents(dossier.people.map((p) => p.balanceCents)) === 0,
  };
}
