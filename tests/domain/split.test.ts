import { describe, expect, it } from 'vitest';
import { computeShares } from '@/domain/split.js';
import { sumCents } from '@/domain/money.js';
import { DomainError } from '@/domain/result.js';

describe('divisão igual', () => {
  it('divide entre todos', () => {
    const result = computeShares(9000, { type: 'equal', participantIds: ['ana', 'bruno', 'carla'] });
    expect(result).toEqual({
      ok: true,
      value: [
        { participantId: 'ana', cents: 3000 },
        { participantId: 'bruno', cents: 3000 },
        { participantId: 'carla', cents: 3000 },
      ],
    });
  });

  it('divide entre um subgrupo, sem tocar em quem não estava', () => {
    // O jantar de ontem foi só a Ana, o Bruno e a Carla; o Davi não estava.
    const result = computeShares(10_000, {
      type: 'equal',
      participantIds: ['ana', 'bruno', 'carla'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((s) => s.participantId)).not.toContain('davi');
    expect(sumCents(result.value.map((s) => s.cents))).toBe(10_000);
  });

  it('recusa divisão sem ninguém', () => {
    expect(computeShares(1000, { type: 'equal', participantIds: [] })).toEqual({
      ok: false,
      error: { code: 'no_participants' },
    });
  });

  it('recusa participante repetido', () => {
    expect(computeShares(1000, { type: 'equal', participantIds: ['ana', 'ana'] })).toEqual({
      ok: false,
      error: { code: 'duplicate_participant', participantId: 'ana' },
    });
  });
});

describe('divisão por valor exato', () => {
  it('aceita quando a soma bate com o total', () => {
    const result = computeShares(10_000, {
      type: 'exact',
      entries: [
        { participantId: 'ana', cents: 7000 },
        { participantId: 'bruno', cents: 3000 },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('aceita alguém com parte zero', () => {
    const result = computeShares(10_000, {
      type: 'exact',
      entries: [
        { participantId: 'ana', cents: 10_000 },
        { participantId: 'bruno', cents: 0 },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('recusa quando falta valor, e diz quanto falta', () => {
    const result = computeShares(10_000, {
      type: 'exact',
      entries: [
        { participantId: 'ana', cents: 5000 },
        { participantId: 'bruno', cents: 1660 },
      ],
    });
    // 3340 centavos faltando -> a UI mostra "faltam R$ 33,40" e bloqueia o salvar.
    expect(result).toEqual({ ok: false, error: { code: 'exact_mismatch', differenceCents: 3340 } });
  });

  it('recusa quando passa do total, com diferença negativa', () => {
    const result = computeShares(10_000, {
      type: 'exact',
      entries: [{ participantId: 'ana', cents: 11_000 }],
    });
    expect(result).toEqual({ ok: false, error: { code: 'exact_mismatch', differenceCents: -1000 } });
  });

  it('recusa parte negativa', () => {
    const result = computeShares(10_000, {
      type: 'exact',
      entries: [
        { participantId: 'ana', cents: 11_000 },
        { participantId: 'bruno', cents: -1000 },
      ],
    });
    expect(result).toEqual({ ok: false, error: { code: 'negative_share', participantId: 'bruno' } });
  });
});

describe('guardas', () => {
  it('recusa total zero ou negativo', () => {
    expect(() => computeShares(0, { type: 'equal', participantIds: ['ana'] })).toThrow(DomainError);
    expect(() => computeShares(-100, { type: 'equal', participantIds: ['ana'] })).toThrow(DomainError);
  });
});
