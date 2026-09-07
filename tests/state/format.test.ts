import { describe, expect, it } from 'vitest';
import { dayLabel, periodLabel, shortDate, todayIso } from '@/state/format';

describe('datas da UI', () => {
  it('rotula hoje e ontem', () => {
    expect(dayLabel('2026-03-14', '2026-03-14')).toBe('Hoje');
    expect(dayLabel('2026-03-13', '2026-03-14')).toBe('Ontem');
  });

  it('atravessa a virada de mês para trás', () => {
    expect(dayLabel('2026-02-28', '2026-03-01')).toBe('Ontem');
  });

  it('mostra dia e mês nos dias mais antigos', () => {
    expect(dayLabel('2026-03-01', '2026-03-14')).toContain('março');
  });

  it('formata data curta e período', () => {
    expect(shortDate('2026-03-09')).toBe('09/03');
    expect(periodLabel('2026-03-12', '2026-03-26')).toBe('12/03 – 26/03');
    expect(periodLabel(null, null)).toBeUndefined();
    expect(periodLabel('2026-03-12', null)).toBe('12/03');
  });

  it('todayIso usa a data local, não UTC', () => {
    // Perto da meia-noite, UTC daria o dia errado — e a despesa cairia no dia
    // seguinte, com a cotação de outro dia.
    const noite = new Date(2026, 2, 14, 23, 30);
    expect(todayIso(noite)).toBe('2026-03-14');
  });
});
