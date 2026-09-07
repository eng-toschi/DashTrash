/**
 * Câmbio (spec §8).
 *
 * A taxa é guardada como inteiro em partes por milhão (ppm): 1 unidade da moeda
 * da despesa vale `ratePpm / 1e6` da moeda-base. Ela é FIXADA no lançamento da
 * despesa e nunca recalculada — recalcular faz o saldo de uma viagem encerrada
 * mudar sozinho, que é a armadilha nº 1 do spec (§17).
 *
 * A conta é feita em BigInt: um gasto em JPY convertido para BRL estoura
 * Number.MAX_SAFE_INTEGER no produto intermediário com facilidade.
 */
import { currencyExponent, money, type CurrencyCode, type Money } from './money';
import { err, invariant, ok, type Result } from './result';

export const RATE_SCALE = 1_000_000;
const RATE_SCALE_BIG = 1_000_000n;
const MAX_RATE_DECIMALS = 6;

/** Divisão com arredondamento "metade para longe do zero", em inteiros. */
function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  invariant(denominator > 0n, 'Denominador deve ser positivo.');
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function convertCents(
  cents: number,
  from: CurrencyCode,
  to: CurrencyCode,
  ratePpm: number,
): number {
  invariant(Number.isSafeInteger(cents), 'Centavos devem ser inteiros.');
  invariant(Number.isSafeInteger(ratePpm) && ratePpm > 0, `Taxa inválida: ${String(ratePpm)}`);
  if (from === to) {
    invariant(ratePpm === RATE_SCALE, `Taxa de ${from} para ${to} deve ser 1, recebida ${String(ratePpm)}.`);
    return cents;
  }

  const exponentDelta = currencyExponent(to) - currencyExponent(from);
  const numerator =
    BigInt(cents) * BigInt(ratePpm) * 10n ** BigInt(Math.max(0, exponentDelta));
  const denominator = RATE_SCALE_BIG * 10n ** BigInt(Math.max(0, -exponentDelta));

  const result = roundedDivide(numerator, denominator);
  invariant(
    result >= BigInt(Number.MIN_SAFE_INTEGER) && result <= BigInt(Number.MAX_SAFE_INTEGER),
    'Valor convertido fora da faixa segura.',
  );
  return Number(result);
}

export function convert(value: Money, to: CurrencyCode, ratePpm: number): Money {
  return money(convertCents(value.cents, value.currency, to, ratePpm), to);
}

/**
 * Converte aplicando um acréscimo proporcional na mesma conta — usado para o IOF
 * (§8.1). O acréscimo entra como ppm: 3,5% = 35_000.
 *
 * Fazer as duas multiplicações numa conta só, com um único arredondamento, é o
 * que impede o centavo fantasma que apareceria ao converter e depois somar o
 * imposto separadamente.
 */
export function convertCentsWithSurcharge(
  cents: number,
  from: CurrencyCode,
  to: CurrencyCode,
  ratePpm: number,
  surchargePpm: number,
): number {
  invariant(Number.isSafeInteger(cents), 'Centavos devem ser inteiros.');
  invariant(
    Number.isSafeInteger(surchargePpm) && surchargePpm >= 0,
    `Acréscimo inválido: ${String(surchargePpm)}`,
  );
  if (surchargePpm === 0) return convertCents(cents, from, to, ratePpm);
  invariant(Number.isSafeInteger(ratePpm) && ratePpm > 0, `Taxa inválida: ${String(ratePpm)}`);
  if (from === to) {
    invariant(ratePpm === RATE_SCALE, `Taxa de ${from} para ${to} deve ser 1.`);
  }

  const exponentDelta = currencyExponent(to) - currencyExponent(from);
  const numerator =
    BigInt(cents) *
    BigInt(ratePpm) *
    (RATE_SCALE_BIG + BigInt(surchargePpm)) *
    10n ** BigInt(Math.max(0, exponentDelta));
  const denominator = RATE_SCALE_BIG * RATE_SCALE_BIG * 10n ** BigInt(Math.max(0, -exponentDelta));

  const result = roundedDivide(numerator, denominator);
  invariant(
    result >= BigInt(Number.MIN_SAFE_INTEGER) && result <= BigInt(Number.MAX_SAFE_INTEGER),
    'Valor convertido fora da faixa segura.',
  );
  return Number(result);
}

/**
 * Caminho inverso: quanto vale, na moeda estrangeira, um valor em moeda-base.
 * A taxa continua sendo a de SEMPRE (estrangeira -> base), então a divisão é
 * feita aqui em vez de o app guardar duas taxas que podem divergir.
 *
 * É o que permite oferecer "pague R$ 1.902,40 no Pix ou ¥ 51.416 em dinheiro"
 * no fechamento (§9.1).
 */
export function convertCentsFromBase(
  cents: number,
  baseCurrency: CurrencyCode,
  to: CurrencyCode,
  rateToBasePpm: number,
): number {
  invariant(Number.isSafeInteger(cents), 'Centavos devem ser inteiros.');
  invariant(
    Number.isSafeInteger(rateToBasePpm) && rateToBasePpm > 0,
    `Taxa inválida: ${String(rateToBasePpm)}`,
  );
  if (baseCurrency === to) {
    invariant(rateToBasePpm === RATE_SCALE, `Taxa de ${to} para ${baseCurrency} deve ser 1.`);
    return cents;
  }

  const exponentDelta = currencyExponent(to) - currencyExponent(baseCurrency);
  const numerator = BigInt(cents) * RATE_SCALE_BIG * 10n ** BigInt(Math.max(0, exponentDelta));
  const denominator = BigInt(rateToBasePpm) * 10n ** BigInt(Math.max(0, -exponentDelta));

  const result = roundedDivide(numerator, denominator);
  invariant(
    result >= BigInt(Number.MIN_SAFE_INTEGER) && result <= BigInt(Number.MAX_SAFE_INTEGER),
    'Valor convertido fora da faixa segura.',
  );
  return Number(result);
}

export interface DatedRate {
  /** 'YYYY-MM-DD' */
  readonly asOf: string;
  readonly ratePpm: number;
}

export interface SelectedRate {
  readonly ratePpm: number;
  readonly asOf: string;
  /** true quando a cotação é de um dia anterior ao do gasto. */
  readonly stale: boolean;
}

/**
 * Escolhe a cotação DO DIA DO GASTO (§8), não a de hoje: lançar ontem à noite o
 * jantar de anteontem tem que usar o câmbio de anteontem.
 *
 * Sem cotação exata, cai na mais recente ANTERIOR e marca `stale` para a tela
 * avisar. Nunca usa uma cotação posterior ao gasto — seria adivinhar o passado
 * com informação do futuro.
 */
export function selectRateForDate(
  rates: readonly DatedRate[],
  spentOn: string,
): SelectedRate | undefined {
  let best: DatedRate | undefined;
  for (const rate of rates) {
    if (rate.asOf > spentOn) continue;
    if (best === undefined || rate.asOf > best.asOf) best = rate;
  }
  if (best === undefined) return undefined;
  return { ratePpm: best.ratePpm, asOf: best.asOf, stale: best.asOf !== spentOn };
}

export type RateParseError =
  | { readonly code: 'empty' }
  | { readonly code: 'invalid' }
  | { readonly code: 'not_positive' }
  | { readonly code: 'too_many_decimals'; readonly allowed: number };

/** Lê a taxa digitada pelo usuário (caso offline, §8) e devolve ppm. */
export function parseRateInput(input: string): Result<number, RateParseError> {
  const raw = input.trim().replace(/\s/gu, '');
  if (raw === '') return err({ code: 'empty' });
  if (!/^\d+([.,]\d+)?$/u.test(raw)) return err({ code: 'invalid' });

  const [integerPart = '', fractionPart = ''] = raw.replace(',', '.').split('.');
  if (fractionPart.length > MAX_RATE_DECIMALS) {
    return err({ code: 'too_many_decimals', allowed: MAX_RATE_DECIMALS });
  }

  const scaled = Number(integerPart + fractionPart.padEnd(MAX_RATE_DECIMALS, '0'));
  if (!Number.isSafeInteger(scaled)) return err({ code: 'invalid' });
  if (scaled <= 0) return err({ code: 'not_positive' });
  return ok(scaled);
}

export function formatRate(ratePpm: number): string {
  const whole = Math.trunc(ratePpm / RATE_SCALE);
  const fraction = String(Math.abs(ratePpm % RATE_SCALE)).padStart(MAX_RATE_DECIMALS, '0');
  return `${String(whole)}.${fraction}`.replace(/0+$/u, '').replace(/\.$/u, '');
}
