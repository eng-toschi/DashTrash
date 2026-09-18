import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { joinChunks, splitIntoChunks } from '@/state/textChunks';

describe('splitIntoChunks', () => {
  it('não divide o que já cabe num pedaço só', () => {
    expect(splitIntoChunks('abc', 10)).toEqual(['abc']);
  });

  it('divide exatamente nos limites do tamanho pedido', () => {
    expect(splitIntoChunks('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
  });

  it('string vazia não produz pedaço nenhum', () => {
    expect(splitIntoChunks('', 10)).toEqual([]);
  });

  it('recusa tamanho de pedaço zero ou negativo — dividiria para sempre', () => {
    expect(() => splitIntoChunks('abc', 0)).toThrow();
    expect(() => splitIntoChunks('abc', -1)).toThrow();
  });

  it('nenhum pedaço passa do tamanho pedido, para qualquer texto', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 500 }), (value, size) => {
        const chunks = splitIntoChunks(value, size);
        for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(size);
      }),
    );
  });
});

describe('splitIntoChunks + joinChunks', () => {
  it('a remontagem sempre devolve exatamente o texto original', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 500 }), (value, size) => {
        expect(joinChunks(splitIntoChunks(value, size))).toBe(value);
      }),
    );
  });

  it('sobrevive a caracteres multibyte no meio de um corte', () => {
    // Emoji e acentos ocupam mais de uma unidade UTF-16 — um corte no meio
    // ainda precisa remontar para o texto original, ainda que separe o par.
    const value = '🎉 café não tá em ASCII 日本語';
    for (let size = 1; size <= value.length; size += 1) {
      expect(joinChunks(splitIntoChunks(value, size))).toBe(value);
    }
  });
});
