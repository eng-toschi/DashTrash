/**
 * Busca de cotação online (spec §8).
 *
 * A resposta vem de um serviço público e é tratada como DADO NÃO CONFIÁVEL: o
 * formato é conferido campo a campo antes de virar taxa. Um palpite errado
 * sobre o formato não pode virar uma cotação errada gravada na despesa — na
 * dúvida, o app cai no preenchimento manual, que é o comportamento que já
 * existia e nunca mente.
 */
import { RATE_SCALE } from '@/domain/fx';
import { err, ok, type Result } from '@/domain/result';

const ENDPOINT = 'https://open.er-api.com/v6/latest';
const TIMEOUT_MS = 8000;

export interface FetchedRate {
  /** Quanto vale 1 unidade da moeda estrangeira na moeda-base, em ppm. */
  readonly ratePpm: number;
  /** 'YYYY-MM-DD' da cotação informada pelo serviço. */
  readonly asOf: string;
}

export type FxFetchError =
  | { readonly code: 'offline' }
  | { readonly code: 'bad_response' }
  | { readonly code: 'unsupported_pair' };

function isoDay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(parsed.getUTCFullYear())}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
}

/** Extrai a taxa de uma resposta já decodificada. Separado para poder testar. */
export function readRate(
  payload: unknown,
  baseCurrency: string,
  today: string,
): Result<FetchedRate, FxFetchError> {
  if (typeof payload !== 'object' || payload === null) return err({ code: 'bad_response' });

  const body = payload as Record<string, unknown>;
  if (body.result !== undefined && body.result !== 'success') return err({ code: 'bad_response' });

  const rates = body.rates;
  if (typeof rates !== 'object' || rates === null) return err({ code: 'bad_response' });

  const rate = (rates as Record<string, unknown>)[baseCurrency];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return err({ code: 'unsupported_pair' });
  }

  const ratePpm = Math.round(rate * RATE_SCALE);
  if (!Number.isSafeInteger(ratePpm) || ratePpm <= 0) return err({ code: 'bad_response' });

  return ok({ ratePpm, asOf: isoDay(body.time_last_update_utc) ?? today });
}

/**
 * Cotação de 1 `quote` em `base`. Nunca lança: sem rede, devolve `offline` e a
 * tela continua pedindo a taxa à mão.
 */
export async function fetchRate(
  quote: string,
  baseCurrency: string,
  today: string,
): Promise<Result<FetchedRate, FxFetchError>> {
  // Corrida com um relógio em vez de AbortController: o tipo do sinal do React
  // Native não é o do DOM, e para um GET pequeno o que importa é não deixar a
  // tela esperando — não cancelar o soquete.
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => { resolve('timeout'); }, TIMEOUT_MS));

  try {
    const outcome = await Promise.race([fetch(`${ENDPOINT}/${quote}`), timeout]);
    if (outcome === 'timeout') return err({ code: 'offline' });
    if (!outcome.ok) return err({ code: 'offline' });
    return readRate(await outcome.json(), baseCurrency, today);
  } catch {
    return err({ code: 'offline' });
  }
}
