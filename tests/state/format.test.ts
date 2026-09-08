import { describe, expect, it } from 'vitest';
import {
  combineDateAndTime,
  dateOfLocalIso,
  dayLabel,
  localIso,
  periodLabel,
  shortDate,
  timeLabel,
  todayIso,
} from '@/state/format';

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

describe('instante local com fuso', () => {
  it('grava a hora do relógio, não o instante em UTC', () => {
    // Um Date construído com componentes locais: o teste roda em qualquer fuso.
    const at = new Date(2026, 2, 14, 21, 4, 30);
    const iso = localIso(at);
    expect(iso).toMatch(/^2026-03-14T21:04:00[+-]\d{2}:\d{2}$/u);
  });

  it('carrega o deslocamento do fuso, e não um "Z"', () => {
    expect(localIso(new Date(2026, 2, 14, 21, 4))).not.toContain('Z');
  });

  it('a data local do instante é a que a lista usa para agrupar', () => {
    expect(dateOfLocalIso('2026-03-14T21:04:00+09:00')).toBe('2026-03-14');
    expect(dateOfLocalIso(localIso(new Date(2026, 11, 31, 23, 59)))).toBe('2026-12-31');
  });
});

describe('timeLabel', () => {
  it('lê a hora do texto, preservando o fuso em que a despesa aconteceu', () => {
    // O ponto da função: 21:04 em Tóquio continua 21:04 lido no Brasil.
    expect(timeLabel('2026-03-14T21:04:00+09:00')).toBe('21:04');
    expect(timeLabel('2026-03-14T21:04:00-03:00')).toBe('21:04');
  });

  it('é indefinida para despesa sem hora — lançada antes de existir o campo', () => {
    expect(timeLabel(null)).toBeUndefined();
    expect(timeLabel(undefined)).toBeUndefined();
    expect(timeLabel('')).toBeUndefined();
    expect(timeLabel('2026-03-14')).toBeUndefined();
  });
});

describe('combineDateAndTime', () => {
  it('troca a data mantendo a hora escolhida', () => {
    const time = new Date(2026, 0, 1, 8, 30);
    expect(combineDateAndTime('2026-03-14', time)).toMatch(/^2026-03-14T08:30:00/u);
  });

  it('não estraga a hora ao cair num mês mais curto', () => {
    // 31 de janeiro às 23h50, remarcado para fevereiro: `setFullYear` com dia
    // fora do mês transbordaria se a ordem dos campos fosse outra.
    const time = new Date(2026, 0, 31, 23, 50);
    expect(combineDateAndTime('2026-02-28', time)).toMatch(/^2026-02-28T23:50:00/u);
  });

  it('o que sai volta pelas duas leituras', () => {
    const iso = combineDateAndTime('2026-07-09', new Date(2026, 0, 1, 14, 5));
    expect(dateOfLocalIso(iso)).toBe('2026-07-09');
    expect(timeLabel(iso)).toBe('14:05');
  });
});
