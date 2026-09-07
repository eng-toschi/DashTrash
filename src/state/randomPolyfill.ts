/**
 * Instala `crypto.getRandomValues` no React Native.
 *
 * O Hermes não traz o objeto `crypto` global que o Node e o navegador têm.
 * Sem isto, qualquer geração de id derruba o app — foi exatamente o que
 * aconteceu na primeira execução em aparelho real.
 *
 * Precisa ser importado ANTES de qualquer código que gere id.
 */
import * as Crypto from 'expo-crypto';

interface RandomSource {
  getRandomValues?: (array: Uint8Array) => unknown;
}

export function installRandomSource(): void {
  const target = globalThis as { crypto?: RandomSource };
  if (typeof target.crypto?.getRandomValues === 'function') return;

  const getRandomValues = (array: Uint8Array): Uint8Array => Crypto.getRandomValues(array);

  try {
    if (target.crypto === undefined) {
      Object.defineProperty(globalThis, 'crypto', {
        value: { getRandomValues } satisfies RandomSource,
        configurable: true,
      });
    } else {
      target.crypto.getRandomValues = getRandomValues;
    }
  } catch {
    // Motor com `crypto` somente-leitura e sem a função: `db/ids` cai no
    // caminho de reserva sozinho, então não há o que fazer aqui.
  }
}
