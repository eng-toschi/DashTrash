import { describe, expect, it } from 'vitest';
import { formatAddress } from '@/state/format';

describe('formatAddress', () => {
  it('junta estabelecimento, bairro e cidade', () => {
    expect(
      formatAddress({ name: 'Ichiran Shibuya', district: 'Shibuya', city: 'Tóquio', country: 'Japão' }),
    ).toBe('Ichiran Shibuya · Shibuya · Tóquio');
  });

  it('usa rua e número quando não há nome de estabelecimento', () => {
    expect(formatAddress({ street: 'Rua Augusta', streetNumber: '1200', city: 'São Paulo' })).toBe(
      'Rua Augusta, 1200 · São Paulo',
    );
  });

  it('não repete o mesmo texto duas vezes', () => {
    // O geocoder devolve `name` igual à rua com frequência.
    expect(formatAddress({ name: 'Rua Augusta', street: 'Rua Augusta', city: 'São Paulo' })).toBe(
      'Rua Augusta · São Paulo',
    );
  });

  it('não produz separadores soltos quando quase tudo vem vazio', () => {
    // O caso que um `join` ingênuo transforma em " ·  · Japão".
    expect(formatAddress({ name: null, street: null, district: null, city: null, country: 'Japão' })).toBe(
      'Japão',
    );
  });

  it('é indefinido quando não veio nada aproveitável', () => {
    expect(formatAddress({})).toBeUndefined();
    expect(formatAddress({ name: '', street: '', city: null })).toBeUndefined();
    expect(formatAddress({ name: '   ' })).toBeUndefined();
  });

  it('corta em três partes para caber na linha da despesa', () => {
    const label = formatAddress({
      name: 'Ichiran',
      district: 'Shibuya',
      city: 'Tóquio',
      country: 'Japão',
    });
    expect(label).toBe('Ichiran · Shibuya · Tóquio');
    expect(label?.split(' · ')).toHaveLength(3);
  });
});
