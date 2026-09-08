import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, categoryColor, categoryTint, personColor, withAlpha } from '../../src/ui/tokens';

describe('cores por categoria', () => {
  it('cai em "other" para categoria desconhecida', () => {
    expect(categoryColor('nao_existe')).toBe(CATEGORY_COLORS.other);
  });

  it('devolve a cor própria de cada categoria conhecida', () => {
    for (const [key, value] of Object.entries(CATEGORY_COLORS)) {
      expect(categoryColor(key)).toBe(value);
    }
  });
});

describe('withAlpha', () => {
  it('acrescenta os dois dígitos que o React Native espera', () => {
    expect(withAlpha('#E8654F', 1)).toBe('#E8654FFF');
    expect(withAlpha('#E8654F', 0)).toBe('#E8654F00');
    expect(withAlpha('#E8654F', 0.5)).toBe('#E8654F80');
  });

  it('sempre produz 9 caracteres, inclusive com alfa baixo', () => {
    // O `padStart` existe por causa deste caso: 0x08 sem ele viraria "#E8654F8",
    // que o React Native lê como outra cor em vez de recusar.
    expect(withAlpha('#E8654F', 0.03)).toBe('#E8654F08');
    expect(withAlpha('#E8654F', 0.14)).toHaveLength(9);
  });

  it('não estoura os limites com valores fora de faixa', () => {
    expect(withAlpha('#E8654F', 5)).toBe('#E8654FFF');
    expect(withAlpha('#E8654F', -1)).toBe('#E8654F00');
  });
});

describe('categoryTint', () => {
  it('usa a mesma cor da categoria, só que translúcida', () => {
    expect(categoryTint('restaurant', false).startsWith(categoryColor('restaurant'))).toBe(true);
  });

  it('cobre mais no escuro, onde o mesmo alfa some no fundo', () => {
    const light = Number.parseInt(categoryTint('restaurant', false).slice(-2), 16);
    const dark = Number.parseInt(categoryTint('restaurant', true).slice(-2), 16);
    expect(dark).toBeGreaterThan(light);
  });
});

describe('personColor', () => {
  it('é estável: a mesma semente dá sempre a mesma cor', () => {
    expect(personColor('ana')).toBe(personColor('ana'));
  });
});
