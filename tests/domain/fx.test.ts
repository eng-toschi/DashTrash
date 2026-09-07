import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  convert,
  convertCents,
  convertCentsFromBase,
  formatRate,
  parseRateInput,
  RATE_SCALE,
  selectRateForDate,
} from '@/domain/fx.js';
import { currencyExponent, money } from '@/domain/money.js';
import { DomainError } from '@/domain/result.js';

describe('convertCents', () => {
  it('converte iene (0 casas) para real (2 casas)', () => {
    // 3200 JPY a 0,037 BRL/JPY = R$ 118,40
    expect(convertCents(3200, 'JPY', 'BRL', 37_000)).toBe(11_840);
  });

  it('converte real (2 casas) para iene (0 casas)', () => {
    expect(convertCents(11_840, 'BRL', 'JPY', 27_027_027)).toBe(3200);
  });

  it('converte entre moedas de mesmo expoente', () => {
    // EUR 100,00 a 6,20 = R$ 620,00
    expect(convertCents(10_000, 'EUR', 'BRL', 6_200_000)).toBe(62_000);
  });

  it('arredonda metade para longe do zero, nos dois sentidos', () => {
    expect(convertCents(1, 'USD', 'BRL', 5_500_000)).toBe(6);
    expect(convertCents(-1, 'USD', 'BRL', 5_500_000)).toBe(-6);
  });

  it('é identidade quando a moeda é a mesma', () => {
    expect(convertCents(12_345, 'BRL', 'BRL', RATE_SCALE)).toBe(12_345);
  });

  it('recusa taxa diferente de 1 para a mesma moeda', () => {
    expect(() => convertCents(100, 'BRL', 'BRL', 2_000_000)).toThrow(DomainError);
  });

  it('recusa taxa zero ou negativa', () => {
    expect(() => convertCents(100, 'USD', 'BRL', 0)).toThrow(DomainError);
    expect(() => convertCents(100, 'USD', 'BRL', -1)).toThrow(DomainError);
  });

  it('aguenta produto intermediário acima do limite do float', () => {
    // 10 bilhões de ienes: o produto cents * ppm passa de 9e15 e só fecha em BigInt.
    const result = convertCents(10_000_000_000, 'JPY', 'BRL', 37_000);
    expect(result).toBe(37_000_000_000);
  });

  it('converte Money preservando a moeda de destino', () => {
    expect(convert(money(3200, 'JPY'), 'BRL', 37_000)).toEqual(money(11_840, 'BRL'));
  });

  it('PROPRIEDADE: é monotônica — quem gastou mais nunca converte para menos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 1, max: 20_000_000 }),
        (a, b, ratePpm) => {
          const [smaller, larger] = a <= b ? [a, b] : [b, a];
          expect(convertCents(smaller, 'USD', 'BRL', ratePpm)).toBeLessThanOrEqual(
            convertCents(larger, 'USD', 'BRL', ratePpm),
          );
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('PROPRIEDADE: o resultado é o exato arredondado, nunca mais que meio centavo fora', () => {
    // Referência calculada em racional exato: o valor convertido não pode estar
    // a mais de meio centavo do valor real. É isso que "arredonda metade para
    // longe do zero" significa, verificado sem passar por float.
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        fc.integer({ min: 1, max: 50_000_000 }),
        fc.constantFrom<[string, string]>(['USD', 'BRL'], ['JPY', 'BRL'], ['BRL', 'JPY'], ['BRL', 'KWD']),
        (cents, ratePpm, [from, to]) => {
          const delta = currencyExponent(to) - currencyExponent(from);
          const numerator = BigInt(cents) * BigInt(ratePpm) * 10n ** BigInt(Math.max(0, delta));
          const denominator = BigInt(RATE_SCALE) * 10n ** BigInt(Math.max(0, -delta));

          const result = BigInt(convertCents(cents, from, to, ratePpm));
          const error = result * denominator - numerator;
          const absoluteError = error < 0n ? -error : error;

          expect(absoluteError * 2n <= denominator).toBe(true);
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('parseRateInput', () => {
  it.each([
    ['5,4', 5_400_000],
    ['5.4', 5_400_000],
    ['0,037', 37_000],
    ['1', 1_000_000],
    ['0,000001', 1],
  ])('lê %s como %i ppm', (input, expected) => {
    expect(parseRateInput(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'empty'],
    ['abc', 'invalid'],
    ['1,2,3', 'invalid'],
    ['0', 'not_positive'],
    ['1,2345678', 'too_many_decimals'],
  ])('recusa %s', (input, code) => {
    const result = parseRateInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('recusa taxa grande demais para um inteiro seguro', () => {
    const result = parseRateInput('99999999999');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid');
  });

  it('formata a taxa de volta sem zeros à toa', () => {
    expect(formatRate(5_400_000)).toBe('5.4');
    expect(formatRate(37_000)).toBe('0.037');
    expect(formatRate(RATE_SCALE)).toBe('1');
  });
});

describe('convertCentsFromBase', () => {
  it('diz quanto vale, em ienes, uma dívida em reais', () => {
    // R$ 1.902,40 a 0,037 = ¥ 51.416 — o que a pessoa entrega em dinheiro.
    expect(convertCentsFromBase(190_240, 'BRL', 'JPY', 37_000)).toBe(51_416);
  });

  it('é identidade na própria moeda-base', () => {
    expect(convertCentsFromBase(190_240, 'BRL', 'BRL', RATE_SCALE)).toBe(190_240);
  });

  it('recusa taxa diferente de 1 para a mesma moeda', () => {
    expect(() => convertCentsFromBase(100, 'BRL', 'BRL', 2_000_000)).toThrow(DomainError);
  });

  it('volta ao ponto de partida em taxas redondas', () => {
    const emEuros = convertCentsFromBase(62_000, 'BRL', 'EUR', 6_200_000);
    expect(emEuros).toBe(10_000);
    expect(convertCents(emEuros, 'EUR', 'BRL', 6_200_000)).toBe(62_000);
  });
});

describe('selectRateForDate', () => {
  const rates = [
    { asOf: '2026-03-12', ratePpm: 36_800 },
    { asOf: '2026-03-14', ratePpm: 37_000 },
    { asOf: '2026-03-17', ratePpm: 37_400 },
  ];

  it('usa a cotação do dia do gasto', () => {
    expect(selectRateForDate(rates, '2026-03-14')).toEqual({
      ratePpm: 37_000,
      asOf: '2026-03-14',
      stale: false,
    });
  });

  it('cai na cotação anterior mais recente e avisa', () => {
    // Lançar hoje o jantar de anteontem tem que usar o câmbio de anteontem.
    expect(selectRateForDate(rates, '2026-03-16')).toEqual({
      ratePpm: 37_000,
      asOf: '2026-03-14',
      stale: true,
    });
  });

  it('nunca usa cotação posterior ao gasto', () => {
    expect(selectRateForDate(rates, '2026-03-10')).toBeUndefined();
  });

  it('devolve indefinido sem nenhuma cotação em cache', () => {
    expect(selectRateForDate([], '2026-03-14')).toBeUndefined();
  });
});
