import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  allocate,
  allocateEqually,
  currencyExponent,
  formatMoney,
  money,
  parseMoneyInput,
  sumCents,
  toDecimalString,
  add,
  subtract,
  negate,
  zero,
} from '@/domain/money.js';
import { DomainError } from '@/domain/result.js';

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${String(i).padStart(2, '0')}`);

describe('allocate', () => {
  it('divide R$ 100,00 entre 3 sem perder centavo', () => {
    const result = allocateEqually(10_000, ['a', 'b', 'c']);
    expect(result.map((r) => r.cents)).toEqual([3334, 3333, 3333]);
    expect(sumCents(result.map((r) => r.cents))).toBe(10_000);
  });

  it('dá o centavo que sobra à mesma pessoa, independente da ordem de entrada', () => {
    const straight = allocateEqually(10_000, ['a', 'b', 'c']);
    const shuffled = allocateEqually(10_000, ['c', 'a', 'b']);
    const centsById = (rs: typeof straight): Record<string, number> =>
      Object.fromEntries(rs.map((r) => [r.id, r.cents]));

    // Determinismo entre dispositivos: o resultado por pessoa não pode depender
    // da ordem em que a lista chegou (spec §6).
    expect(centsById(shuffled)).toEqual(centsById(straight));
  });

  it('respeita os pesos', () => {
    const result = allocate(10_000, [
      { id: 'a', weight: 3 },
      { id: 'b', weight: 1 },
    ]);
    expect(result).toEqual([
      { id: 'a', cents: 7500 },
      { id: 'b', cents: 2500 },
    ]);
  });

  it('funciona com uma pessoa só, com total zero e com valor negativo', () => {
    expect(allocateEqually(999, ['a'])).toEqual([{ id: 'a', cents: 999 }]);
    expect(sumCents(allocateEqually(0, ids(5)).map((r) => r.cents))).toBe(0);
    expect(sumCents(allocateEqually(-10_000, ids(3)).map((r) => r.cents))).toBe(-10_000);
  });

  it('ignora quem tem peso zero mas mantém a pessoa no resultado', () => {
    const result = allocate(300, [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 1 },
    ]);
    expect(result).toEqual([
      { id: 'a', cents: 0 },
      { id: 'b', cents: 300 },
    ]);
  });

  it('recusa repartir valor sem nenhum peso positivo', () => {
    expect(() => allocate(100, [{ id: 'a', weight: 0 }])).toThrow(DomainError);
  });

  it('recusa centavo fracionário', () => {
    expect(() => allocateEqually(10.5, ['a'])).toThrow(DomainError);
  });

  it('aguenta valores acima do limite seguro do float em produto intermediário', () => {
    const total = 900_000_000_000_000; // 9e14 centavos
    const result = allocateEqually(total, ids(7));
    expect(sumCents(result.map((r) => r.cents))).toBe(total);
  });

  it('PROPRIEDADE: a soma das partes é sempre exatamente o total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000, max: 100_000_000 }),
        fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 25 }),
        (total, weights) => {
          const entries = weights.map((weight, i) => ({ id: `p${String(i)}`, weight }));
          const hasWeight = weights.some((w) => w > 0);
          if (!hasWeight) return true;

          const result = allocate(total, entries);
          expect(sumCents(result.map((r) => r.cents))).toBe(total);
          if (total >= 0) expect(result.every((r) => r.cents >= 0)).toBe(true);
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('PROPRIEDADE: nenhuma parte difere da parte justa por mais de um centavo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 30 }),
        (total, n) => {
          const result = allocateEqually(total, ids(n));
          const min = Math.min(...result.map((r) => r.cents));
          const max = Math.max(...result.map((r) => r.cents));
          expect(max - min).toBeLessThanOrEqual(1);
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('moedas com expoente diferente de 2', () => {
  it('conhece JPY (0 casas) e KWD (3 casas)', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('BRL')).toBe(2);
    expect(currencyExponent('EUR')).toBe(2);
  });

  it('divide ienes sem inventar centavo', () => {
    const result = allocateEqually(3200, ['a', 'b', 'c']);
    expect(result.map((r) => r.cents)).toEqual([1067, 1067, 1066]);
    expect(sumCents(result.map((r) => r.cents))).toBe(3200);
  });

  it('formata cada moeda com as casas certas', () => {
    expect(formatMoney(money(123_456, 'BRL'), 'pt-BR')).toContain('1.234,56');
    expect(formatMoney(money(3200, 'JPY'), 'pt-BR')).toContain('3.200');
    expect(formatMoney(money(1234, 'KWD'), 'en')).toContain('1.234');
  });

  it('formata valores acima da precisão do float sem perder dígito', () => {
    expect(formatMoney(money(1_234_567_890_123_456, 'BRL'), 'pt-BR')).toContain(
      '12.345.678.901.234,56',
    );
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['1.234,56', 'BRL', 'pt-BR', 123_456],
    ['1,234.56', 'BRL', 'en-US', 123_456],
    ['1234,5', 'BRL', 'pt-BR', 123_450],
    ['1234', 'BRL', 'pt-BR', 123_400],
    ['0,01', 'BRL', 'pt-BR', 1],
    ['1.234', 'BRL', 'pt-BR', 123_400],
    ['1,234', 'BRL', 'en-US', 123_400],
    ['1234.56', 'BRL', 'pt-BR', 123_456],
    ['1.234.567,89', 'BRL', 'pt-BR', 123_456_789],
    ['3200', 'JPY', 'pt-BR', 3200],
    ['1.234', 'KWD', 'en-US', 1234],
    ['-50,25', 'BRL', 'pt-BR', -5025],
  ])('lê %s (%s, %s) como %i centavos', (input, currency, locale, expected) => {
    expect(parseMoneyInput(input, currency, locale)).toEqual({ ok: true, value: expected });
  });

  it('a mesma string vale coisas diferentes em locales diferentes', () => {
    // Em pt-BR a vírgula é decimal: 10,999 tem três casas e BRL só aceita duas.
    expect(parseMoneyInput('10,999', 'BRL', 'pt-BR')).toEqual({
      ok: false,
      error: { code: 'too_many_decimals', allowed: 2 },
    });
    // Em en-US a vírgula é separador de milhar: dez mil novecentos e noventa e nove.
    expect(parseMoneyInput('10,999', 'BRL', 'en-US')).toEqual({ ok: true, value: 1_099_900 });
  });

  it('recusa casas demais em vez de arredondar escondido', () => {
    expect(parseMoneyInput('10,9999', 'BRL', 'pt-BR')).toEqual({
      ok: false,
      error: { code: 'too_many_decimals', allowed: 2 },
    });
  });

  it('recusa iene com centavo', () => {
    expect(parseMoneyInput('3200,5', 'JPY', 'pt-BR')).toEqual({
      ok: false,
      error: { code: 'too_many_decimals', allowed: 0 },
    });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'invalid'],
    ['12abc', 'invalid'],
    [',', 'invalid'],
  ])('recusa %s', (input, code) => {
    const result = parseMoneyInput(input, 'BRL', 'pt-BR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('recusa valor grande demais para caber num inteiro seguro', () => {
    expect(parseMoneyInput('99999999999999999,99', 'BRL', 'pt-BR')).toEqual({
      ok: false,
      error: { code: 'invalid' },
    });
  });

  it('PROPRIEDADE: formatar e reler devolve o mesmo valor', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (cents) => {
        const text = toDecimalString(cents, 2).replace('.', ',');
        expect(parseMoneyInput(text, 'BRL', 'pt-BR')).toEqual({ ok: true, value: cents });
        return true;
      }),
      { numRuns: 300 },
    );
  });
});

describe('operações de Money', () => {
  it('soma, subtrai e nega', () => {
    expect(add(money(100, 'BRL'), money(50, 'BRL'))).toEqual(money(150, 'BRL'));
    expect(subtract(money(100, 'BRL'), money(150, 'BRL'))).toEqual(money(-50, 'BRL'));
    expect(negate(money(100, 'BRL'))).toEqual(money(-100, 'BRL'));
    expect(zero('BRL')).toEqual(money(0, 'BRL'));
  });

  it('recusa somar moedas diferentes em vez de fingir que dá', () => {
    expect(() => add(money(100, 'BRL'), money(100, 'EUR'))).toThrow(DomainError);
  });

  it('recusa moeda malformada e centavo fracionário', () => {
    expect(() => money(100, 'brl')).toThrow(DomainError);
    expect(() => money(1.5, 'BRL')).toThrow(DomainError);
  });

  it('toDecimalString cobre zero, negativo e expoente 0', () => {
    expect(toDecimalString(5, 2)).toBe('0.05');
    expect(toDecimalString(-1234, 2)).toBe('-12.34');
    expect(toDecimalString(3200, 0)).toBe('3200');
  });
});
