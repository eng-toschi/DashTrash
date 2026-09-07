/**
 * Forma de pagamento e IOF (spec §8.1).
 *
 * O IOF muda por decreto. Por isso ele é tratado exatamente como o câmbio: a
 * alíquota é CONGELADA na despesa no momento do lançamento e nunca recalculada.
 * Se o governo mexer na alíquota em outubro, a viagem de março continua com a
 * conta que as pessoas realmente pagaram.
 *
 * Os valores em `IOF_DEFAULT_PPM` são apenas o palpite inicial da tela — o
 * usuário pode corrigir por viagem e por despesa, e a data da referência fica
 * registrada em `IOF_REFERENCE`.
 */
import { convertCentsWithSurcharge } from './fx.js';
import type { CurrencyCode } from './money.js';
import { invariant } from './result.js';

export type PaymentMethod =
  /** Cartão de crédito internacional. */
  | 'credit_card'
  /** Cartão de débito ou pré-pago internacional. */
  | 'debit_card'
  /** Moeda em espécie comprada em casa de câmbio. */
  | 'cash_fx'
  /** Conta ou carteira global (Wise, Nomad e afins) para gastos pessoais. */
  | 'global_account'
  /** Sem operação de câmbio brasileira: pagamento em reais, ou por quem mora fora. */
  | 'no_fx';

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'credit_card',
  'debit_card',
  'cash_fx',
  'global_account',
  'no_fx',
];

/**
 * Alíquotas de IOF em ppm (3,5% = 35_000), conforme os decretos de 2025 que
 * unificaram cartão, espécie e conta global em 3,5%.
 *
 * CONFIRA antes de confiar: isto é padrão de tela, não fonte da verdade fiscal.
 */
export const IOF_DEFAULT_PPM: Readonly<Record<PaymentMethod, number>> = {
  credit_card: 35_000,
  debit_card: 35_000,
  cash_fx: 35_000,
  global_account: 35_000,
  no_fx: 0,
};

/** De quando é a tabela acima, para a tela poder dizer "conferido em". */
export const IOF_REFERENCE = { source: 'Decretos de 2025', checkedOn: '2026-09-07' } as const;

export interface PaidAmount {
  /** Convertido para a moeda-base, já com o IOF embutido. */
  readonly totalCents: number;
  /** Quanto do total acima é IOF. Só para exibição — nunca some isso de novo. */
  readonly iofCents: number;
  /** O valor convertido sem IOF, para a tela mostrar a decomposição. */
  readonly netCents: number;
}

/**
 * Decompõe o custo real de uma despesa em moeda estrangeira.
 *
 * `totalCents` é calculado numa conta única (câmbio e IOF juntos) e é o número
 * que vale; `iofCents` é derivado por diferença, justamente para que
 * `netCents + iofCents === totalCents` sempre feche na tela.
 */
export function paidAmount(
  cents: number,
  currency: CurrencyCode,
  baseCurrency: CurrencyCode,
  ratePpm: number,
  iofPpm: number,
): PaidAmount {
  invariant(Number.isSafeInteger(iofPpm) && iofPpm >= 0, `IOF inválido: ${String(iofPpm)}`);
  const totalCents = convertCentsWithSurcharge(cents, currency, baseCurrency, ratePpm, iofPpm);
  const netCents = convertCentsWithSurcharge(cents, currency, baseCurrency, ratePpm, 0);
  return { totalCents, iofCents: totalCents - netCents, netCents };
}

/** Uma despesa em reais pagos no Brasil não tem câmbio, logo não tem IOF. */
export function suggestIofPpm(method: PaymentMethod, currency: CurrencyCode, baseCurrency: CurrencyCode): number {
  if (currency === baseCurrency) return 0;
  return IOF_DEFAULT_PPM[method];
}
