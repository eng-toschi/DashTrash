import { afterEach, describe, expect, it } from 'vitest';
import { uuidV7 } from '@/db/ids';

interface Global {
  crypto?: unknown;
}

const original = (globalThis as Global).crypto;

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
});

describe('uuidV7', () => {
  it('tem o formato e a versão certos', () => {
    const id = uuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it('ordena por tempo quando comparado como texto', () => {
    // É disso que dependem a ordem do outbox e o desempate de centavos.
    const antes = uuidV7(1_700_000_000_000);
    const depois = uuidV7(1_700_000_001_000);
    expect(antes < depois).toBe(true);
  });

  it('não repete', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => uuidV7()));
    expect(ids.size).toBe(2000);
  });

  it('FUNCIONA SEM `crypto` GLOBAL, como no Hermes', () => {
    // O motor do React Native não tem `crypto`. Assumir que tem derrubou o app
    // na primeira execução em aparelho real; este teste guarda a correção.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    const id = uuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(new Set(Array.from({ length: 500 }, () => uuidV7())).size).toBe(500);
  });
})
