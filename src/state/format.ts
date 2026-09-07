/** Formatação de datas e rótulos da UI. Dinheiro fica em `domain/money`. */
const LOCALE = 'pt-BR';

export function parseIsoDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Hoje", "Ontem" ou "14 de março" — cabeçalho da lista de despesas. */
export function dayLabel(iso: string, today: string = todayIso()): string {
  if (iso === today) return 'Hoje';

  const yesterday = new Date(parseIsoDate(today));
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === todayIso(yesterday)) return 'Ontem';

  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' }).format(parseIsoDate(iso));
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' }).format(parseIsoDate(iso));
}

export function periodLabel(startsOn: string | null, endsOn: string | null): string | undefined {
  if (startsOn === null && endsOn === null) return undefined;
  if (startsOn !== null && endsOn !== null) {
    return `${shortDate(startsOn)} – ${shortDate(endsOn)}`;
  }
  return shortDate(startsOn ?? endsOn ?? '');
}

export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  restaurant: 'Restaurante',
  groceries: 'Mercado',
  lodging: 'Hospedagem',
  transport: 'Transporte',
  flight: 'Voo',
  car: 'Carro',
  activity: 'Passeio',
  shopping: 'Compras',
  fees: 'Taxas',
  other: 'Outros',
};

export const CATEGORY_ORDER = [
  'restaurant',
  'lodging',
  'transport',
  'groceries',
  'car',
  'activity',
  'flight',
  'shopping',
  'fees',
  'other',
] as const;

export const PAYMENT_LABELS: Readonly<Record<string, string>> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash_fx: 'Dinheiro trocado',
  global_account: 'Conta global',
  no_fx: 'Sem câmbio',
};
