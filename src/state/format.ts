/**
 * Formatação de datas e rótulos da UI. Dinheiro fica em `domain/money`.
 *
 * Toda chamada ao `Intl` tem reserva: o Hermes implementa só parte da API, e
 * uma exceção aqui derruba a lista de despesas inteira. Já aconteceu três vezes
 * nesta fase (`crypto`, `normalize`, `formatToParts`) — a essa altura, assumir
 * que a plataforma tem a API é o erro, não a exceção.
 */
const LOCALE = 'pt-BR';

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function parseIsoDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Instante local COM O FUSO em que ele aconteceu: `2026-03-14T21:04:00+09:00`.
 *
 * Não é UTC de propósito. O jantar foi às 21h em Tóquio; gravado como instante
 * absoluto, ele viraria 09h assim que a pessoa conferisse a conta de volta no
 * Brasil, e a despesa mudaria de dia na lista. O que interessa numa conta de
 * viagem é a hora que as pessoas viram no relógio.
 */
export function localIso(at: Date = new Date()): string {
  const offsetMinutes = -at.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  return `${todayIso(at)}T${pad(at.getHours())}:${pad(at.getMinutes())}:00${offset}`;
}

/** A data local de um instante gravado — o que `spent_on` tem de espelhar. */
export function dateOfLocalIso(value: string): string {
  return value.slice(0, 10);
}

/**
 * "21:04" — lido DO TEXTO, nunca por um `Date`.
 *
 * Passar por `Date` reinterpretaria o instante no fuso do aparelho, que é
 * exatamente o que `localIso` existe para evitar.
 */
export function timeLabel(value: string | null | undefined): string | undefined {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/u.exec(value ?? '');
  return match === null ? undefined : `${match[1] ?? ''}:${match[2] ?? ''}`;
}

/** Constrói o instante a partir da data e da hora escolhidas na tela. */
export function combineDateAndTime(isoDate: string, time: Date): string {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  const at = new Date(time);
  at.setFullYear(year, month - 1, day);
  return localIso(at);
}

/** "Hoje", "Ontem" ou "14 de março" — cabeçalho da lista de despesas. */
export function dayLabel(iso: string, today: string = todayIso()): string {
  if (iso === today) return 'Hoje';

  const yesterday = new Date(parseIsoDate(today));
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === todayIso(yesterday)) return 'Ontem';

  const date = parseIsoDate(iso);
  try {
    return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' }).format(date);
  } catch {
    return `${String(date.getDate())} de ${MONTHS_PT[date.getMonth()] ?? ''}`;
  }
}

export function shortDate(iso: string): string {
  const date = parseIsoDate(iso);
  try {
    return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' }).format(date);
  } catch {
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  }
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

/**
 * Monta o endereço da despesa a partir do que o geocoder do sistema devolveu.
 *
 * Mora aqui, e não em `services/place`, porque aquele módulo importa
 * `expo-location` — arrastar o runtime do Expo para dentro do Node só para
 * testar uma junção de strings é o tipo de acoplamento que faz a suíte parar de
 * rodar. Os campos vêm nulos em combinações que variam por país, e é onde um
 * `join` ingênuo produz " ·  · Japão".
 */
export function formatAddress(address: {
  readonly name?: string | null;
  readonly street?: string | null;
  readonly streetNumber?: string | null;
  readonly district?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly country?: string | null;
}): string | undefined {
  const street =
    address.street === null || address.street === undefined || address.street === ''
      ? undefined
      : address.streetNumber === null || address.streetNumber === undefined || address.streetNumber === ''
        ? address.street
        : `${address.street}, ${address.streetNumber}`;

  // `name` costuma ser o estabelecimento ("Ichiran Shibuya"), que é o que a
  // pessoa reconhece. Mas em muitos lugares ele repete o número da rua, e aí
  // vira ruído — só entra quando acrescenta alguma coisa.
  const place =
    address.name === null || address.name === undefined || address.name === '' ? undefined : address.name;
  const head = place !== undefined && place !== street ? place : street;

  const parts = [head, address.district ?? undefined, address.city ?? undefined, address.country ?? undefined]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '');

  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length === 0 ? undefined : unique.slice(0, 3).join(' · ');
}
