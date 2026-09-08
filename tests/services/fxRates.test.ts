import { describe, expect, it } from 'vitest';
import { readRate } from '@/services/fxRates';

const HOJE = '2026-09-08';

describe('leitura da cotação', () => {
  it('lê a resposta esperada do serviço', () => {
    expect(
      readRate(
        {
          result: 'success',
          base_code: 'JPY',
          time_last_update_utc: 'Mon, 07 Sep 2026 00:02:31 +0000',
          rates: { JPY: 1, BRL: 0.037, USD: 0.0068 },
        },
        'BRL',
        HOJE,
      ),
    ).toEqual({ ok: true, value: { ratePpm: 37_000, asOf: '2026-09-07' } });
  });

  it('usa a data de hoje quando o serviço não informa uma legível', () => {
    const result = readRate({ rates: { BRL: 5.4 } }, 'BRL', HOJE);
    expect(result).toEqual({ ok: true, value: { ratePpm: 5_400_000, asOf: HOJE } });
  });

  it.each([
    ['nulo', null],
    ['texto', 'não é json'],
    ['sem rates', { result: 'success' }],
    ['rates não é objeto', { rates: 'nada' }],
    ['resultado de erro', { result: 'error', 'error-type': 'unsupported-code' }],
    ['taxa como texto', { rates: { BRL: '5,40' } }],
    ['taxa zero', { rates: { BRL: 0 } }],
    ['taxa negativa', { rates: { BRL: -1 } }],
    ['taxa infinita', { rates: { BRL: Number.POSITIVE_INFINITY } }],
  ])('recusa resposta %s em vez de inventar uma taxa', (_nome, payload) => {
    // Uma cotação errada gravada na despesa é pior que pedir a taxa à mão:
    // ela some dentro de um número plausível e ninguém confere.
    expect(readRate(payload, 'BRL', HOJE).ok).toBe(false);
  });

  it('avisa quando o par não existe na resposta', () => {
    const result = readRate({ result: 'success', rates: { USD: 1 } }, 'BRL', HOJE);
    expect(result).toEqual({ ok: false, error: { code: 'unsupported_pair' } });
  });
});
