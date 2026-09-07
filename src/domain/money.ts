/**
 * Dinheiro (spec §6).
 *
 * Regra única e inegociável: valor monetário é SEMPRE um inteiro na menor unidade
 * da moeda. Nenhum `number` fracionário entra ou sai daqui. O único ponto do app
 * onde existe divisão é `allocate`, e ela é feita em BigInt para nunca perder centavo.
 */
import { DomainError, err, invariant, ok, type Result } from './result';

export type CurrencyCode = string;

/** Moedas cujo expoente não é 2. Todo o resto assume 2 casas. */
const NON_DEFAULT_EXPONENT: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Casas decimais da moeda. JPY não tem centavo; KWD tem três (spec §17.8). */
export function currencyExponent(currency: CurrencyCode): number {
  invariant(CURRENCY_RE.test(currency), `Moeda inválida: ${currency}`);
  return NON_DEFAULT_EXPONENT[currency] ?? 2;
}

export interface Money {
  readonly cents: number;
  readonly currency: CurrencyCode;
}

export function money(cents: number, currency: CurrencyCode): Money {
  invariant(Number.isSafeInteger(cents), `Valor monetário deve ser inteiro, recebido: ${String(cents)}`);
  invariant(CURRENCY_RE.test(currency), `Moeda inválida: ${currency}`);
  return { cents, currency };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError(`Moedas diferentes: ${a.currency} e ${b.currency}. Converta antes de somar.`);
  }
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.cents + b.cents, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.cents - b.cents, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.cents, a.currency);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce<number>((acc, v) => acc + v, 0);
}

export interface Weighted {
  readonly id: string;
  readonly weight: number;
}

export interface Allocation {
  readonly id: string;
  readonly cents: number;
}

/**
 * Reparte `totalCents` entre `entries` proporcionalmente ao peso (spec §6).
 *
 * Método do maior resto: cada um recebe o piso da parte exata e os centavos que
 * sobram vão para as maiores partes fracionárias. Empate é resolvido pelo `id`
 * em ordem lexicográfica — é isso que faz o celular da Ana e o do Bruno chegarem
 * ao mesmo centavo sem se falarem.
 *
 * Garantia: a soma do resultado é EXATAMENTE `totalCents`, para qualquer entrada.
 */
export function allocate(totalCents: number, entries: readonly Weighted[]): Allocation[] {
  invariant(Number.isSafeInteger(totalCents), `Total deve ser inteiro, recebido: ${String(totalCents)}`);
  for (const e of entries) {
    invariant(
      Number.isSafeInteger(e.weight) && e.weight >= 0,
      `Peso deve ser inteiro não-negativo, recebido: ${String(e.weight)} (${e.id})`,
    );
  }

  const totalWeight = entries.reduce<number>((acc, e) => acc + e.weight, 0);

  if (totalWeight === 0) {
    invariant(totalCents === 0, 'Não é possível repartir um valor sem nenhum peso positivo.');
    return entries.map((e) => ({ id: e.id, cents: 0 }));
  }

  // Trabalha em módulo e devolve o sinal no fim: floor() em negativo distorceria o resto.
  const sign = totalCents < 0 ? -1 : 1;
  const total = BigInt(Math.abs(totalCents));
  const weightSum = BigInt(totalWeight);

  const parts = entries.map((entry, index) => {
    const numerator = total * BigInt(entry.weight);
    return {
      index,
      id: entry.id,
      base: numerator / weightSum,
      remainder: numerator % weightSum,
    };
  });

  const distributed = parts.reduce<bigint>((acc, p) => acc + p.base, 0n);
  let leftover = Number(total - distributed);

  // Maior resto primeiro; empate pelo id (determinismo entre dispositivos).
  const order = [...parts].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const extra = new Array<bigint>(parts.length).fill(0n);
  for (const p of order) {
    if (leftover <= 0) break;
    extra[p.index] = 1n;
    leftover -= 1;
  }

  const result = parts.map((p) => ({
    id: p.id,
    cents: Number(p.base + (extra[p.index] ?? 0n)) * sign,
  }));

  invariant(sumCents(result.map((r) => r.cents)) === totalCents, 'allocate quebrou o total (bug).');
  return result;
}

/** Divide igualmente entre os ids informados. Atalho de `allocate` com peso 1. */
export function allocateEqually(totalCents: number, ids: readonly string[]): Allocation[] {
  return allocate(
    totalCents,
    ids.map((id) => ({ id, weight: 1 })),
  );
}

export type MoneyParseError =
  | { readonly code: 'empty' }
  | { readonly code: 'invalid' }
  | { readonly code: 'too_many_decimals'; readonly allowed: number };

interface Separators {
  readonly decimal: string;
  readonly group: string;
}

/**
 * Descobre os separadores do locale SEM `formatToParts`.
 *
 * O Hermes implementa `Intl.NumberFormat.format`, mas não `formatToParts` — e
 * chamá-lo derruba a tela de nova despesa. Aqui a gente formata um número
 * conhecido e lê os separadores do resultado: em pt-BR, 1234,5 vira "1.234,5",
 * então o último não-dígito é o decimal e o primeiro é o de milhar.
 */
export function separatorsFromSample(locale: string): Separators {
  const sample = new Intl.NumberFormat(locale).format(1234.5);
  const symbols = sample.replace(/\d/gu, '');

  const decimal = symbols.slice(-1) || '.';
  const group = symbols.length > 1 ? symbols.slice(0, 1) : decimal === ',' ? '.' : ',';
  return { decimal, group };
}

function localeSeparators(locale: string): Separators {
  try {
    const formatter = new Intl.NumberFormat(locale);
    if (typeof formatter.formatToParts === 'function') {
      const parts = formatter.formatToParts(12345.6);
      const decimal = parts.find((p) => p.type === 'decimal')?.value;
      const group = parts.find((p) => p.type === 'group')?.value;
      if (decimal !== undefined) return { decimal, group: group ?? (decimal === ',' ? '.' : ',') };
    }
    return separatorsFromSample(locale);
  } catch {
    // Último recurso: convenção do português, que é o locale padrão do app.
    return { decimal: ',', group: '.' };
  }
}

/**
 * Converte a entrada do usuário em centavos (spec §6).
 *
 * A leitura depende do locale, e não dá para fugir disso: em pt-BR "10,999" é
 * dez inteiros e 999 milésimos — casas demais para BRL, portanto ERRO — enquanto
 * em en-US "10,999" é dez mil novecentos e noventa e nove. Adivinhar pelo formato
 * sozinho transforma R$ 10,99 em R$ 10.999,00 sem ninguém perceber.
 *
 * Aceita `1.234,56`, `1,234.56`, `1234,5`, `1234`. Casas demais para a moeda são
 * sempre erro, nunca arredondamento silencioso: quem digitou 10,999 precisa saber
 * que o app não vai decidir sozinho por 11,00.
 */
export function parseMoneyInput(
  input: string,
  currency: CurrencyCode,
  locale: string,
): Result<number, MoneyParseError> {
  const exponent = currencyExponent(currency);
  const raw = input.trim();
  if (raw === '') return err({ code: 'empty' });

  const negative = raw.startsWith('-');
  const cleaned = raw.replace(/^[-+]/u, '').replace(/[\s\u00a0\u202f]/gu, '');
  if (!/^[\d.,]+$/u.test(cleaned) || !/\d/u.test(cleaned)) return err({ code: 'invalid' });

  const dots = cleaned.split('.').length - 1;
  const commas = cleaned.split(',').length - 1;
  const { decimal: localeDecimal } = localeSeparators(locale);

  let integerPart = cleaned;
  let fractionPart = '';

  if (dots > 0 || commas > 0) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    const separator = lastDot > lastComma ? '.' : ',';
    const cut = Math.max(lastDot, lastComma);
    const head = cleaned.slice(0, cut);
    const tail = cleaned.slice(cut + 1);
    const occurrences = separator === '.' ? dots : commas;
    const bothPresent = dots > 0 && commas > 0;

    // O separador que aparece por último é o decimal quando os dois estão
    // presentes; repetido, só pode ser separador de milhar.
    const isDecimal = bothPresent
      ? true
      : occurrences > 1
        ? false
        : separator === localeDecimal || tail.length !== 3
          ? true
          : exponent === 3;

    if (isDecimal) {
      integerPart = head;
      fractionPart = tail;
    } else {
      integerPart = head + tail;
      fractionPart = '';
    }
  }

  integerPart = integerPart.replace(/[.,]/gu, '');
  if (!/^\d*$/u.test(integerPart) || !/^\d*$/u.test(fractionPart)) return err({ code: 'invalid' });
  if (integerPart === '' && fractionPart === '') return err({ code: 'invalid' });
  if (fractionPart.length > exponent) return err({ code: 'too_many_decimals', allowed: exponent });

  const digits = (integerPart === '' ? '0' : integerPart) + fractionPart.padEnd(exponent, '0');
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return err({ code: 'invalid' });

  return ok(negative ? -value : value);
}

/** Representação decimal exata, sem passar por float. Ex.: (-1234, 2) → "-12.34". */
export function toDecimalString(cents: number, exponent: number): string {
  invariant(Number.isSafeInteger(cents), 'Centavos devem ser inteiros.');
  const sign = cents < 0 ? '-' : '';
  const digits = Math.abs(cents).toString().padStart(exponent + 1, '0');
  if (exponent === 0) return sign + digits;
  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/**
 * O `Intl` aceita string neste motor?
 *
 * Passar a string decimal exata é o que mantém a promessa de nenhum valor
 * monetário passar por float, nem ao exibir. Mas o Hermes (motor do React
 * Native) tem implementação própria de `Intl` e pode não suportar a sobrecarga
 * de string do Intl.NumberFormat V3 — e uma exceção aqui quebraria toda tela
 * que mostra dinheiro. A sondagem roda uma vez e escolhe o caminho seguro.
 */
const INTL_ACCEPTS_STRING = ((): boolean => {
  try {
    const probe = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format('1.05');
    return probe.includes('1.05');
  } catch {
    return false;
  }
})();

/**
 * Formata para exibição.
 *
 * Onde o motor aceita, o valor vai ao `Intl` como string decimal exata. Onde não
 * aceita, cai para `number` — o que só perde precisão acima de ~90 trilhões de
 * centavos, faixa em que uma divisão de conta de viagem não chega.
 */
export function formatMoney(value: Money, locale: string): string {
  const exponent = currencyExponent(value.currency);
  const decimal = toDecimalString(value.cents, exponent);

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    });
    return INTL_ACCEPTS_STRING ? formatter.format(decimal) : formatter.format(Number(decimal));
  } catch {
    return formatWithoutIntl(value, locale, exponent, decimal);
  }
}

/**
 * Reserva para quando o `Intl` não dá conta da moeda pedida.
 *
 * Mostra o código ISO em vez de tentar adivinhar símbolo — feio, mas nunca
 * ambíguo, e melhor que derrubar toda tela que mostra valor.
 */
function formatWithoutIntl(value: Money, locale: string, exponent: number, decimal: string): string {
  const { decimal: decimalMark, group } = localeSeparators(locale);
  const [integerPart = '0', fractionPart = ''] = decimal.replace('-', '').split('.');

  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/gu, group);
  const number = exponent === 0 ? grouped : `${grouped}${decimalMark}${fractionPart}`;
  return `${value.cents < 0 ? '-' : ''}${value.currency} ${number}`;
}

/** Exposto só para o teste conferir qual caminho o motor tomou. */
export const intlAcceptsString = INTL_ACCEPTS_STRING;
