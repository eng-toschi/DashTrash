/**
 * Identificadores.
 *
 * UUID v7: os 48 bits iniciais são o instante em milissegundos, então os ids
 * saem em ordem cronológica quando ordenados como texto. Isso importa em dois
 * lugares: o outbox drena na ordem em que as coisas aconteceram, e o desempate
 * de centavos do `allocate` (lexicográfico por id) fica estável e previsível.
 */
interface RandomSource {
  getRandomValues?: (array: Uint8Array) => unknown;
}

/**
 * Fonte de aleatoriedade.
 *
 * `crypto` é global no Node e no navegador, mas NÃO no Hermes, o motor do
 * React Native — assumir que existe derruba o app na primeira tela. O app
 * instala a implementação real do aparelho em `state/randomPolyfill`; este
 * caminho de reserva existe para nunca depender dessa ordem de carregamento.
 *
 * A reserva serve para IDENTIFICADORES LOCAIS, onde colisão é o único risco e
 * ele é desprezível. Ela não serve para segredo nenhum: token de convite
 * (Fase 6) precisa de fonte criptográfica de verdade, gerada no servidor.
 */
function randomSource(): RandomSource | undefined {
  // Nem o acesso pode escapar: `typeof` sozinho já é seguro para identificador
  // não declarado, e o try/catch cobre qualquer motor que trate `globalThis`
  // de forma exótica. Aqui não pode sobrar caminho que lance exceção.
  try {
    if (typeof globalThis === 'undefined') return undefined;
    return (globalThis as { crypto?: RandomSource }).crypto;
  } catch {
    return undefined;
  }
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);

  try {
    const source = randomSource();
    if (typeof source?.getRandomValues === 'function') {
      source.getRandomValues(bytes);
      return bytes;
    }
  } catch {
    // Cai na reserva abaixo.
  }

  for (let i = 0; i < count; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

export function uuidV7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(Math.floor(now));

  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((timestamp >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versão 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
