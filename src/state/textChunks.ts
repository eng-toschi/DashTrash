/**
 * Divide um texto grande em pedaços — para caber num armazenamento que limita
 * o tamanho de cada entrada (spec §12: sessão no SecureStore).
 *
 * Puro de propósito, sem tocar o Keychain/Keystore: é o que permite testar a
 * divisão e a remontagem sem precisar de um aparelho.
 */

/** Divide `value` em pedaços de no máximo `size` caracteres. */
export function splitIntoChunks(value: string, size: number): string[] {
  if (size <= 0) throw new Error(`Tamanho de pedaço deve ser positivo, recebido: ${String(size)}`);
  if (value === '') return [];

  const chunks: string[] = [];
  for (let start = 0; start < value.length; start += size) {
    chunks.push(value.slice(start, start + size));
  }
  return chunks;
}

/** Remonta o texto original a partir dos pedaços, na ordem em que vieram. */
export function joinChunks(chunks: readonly string[]): string {
  return chunks.join('');
}
