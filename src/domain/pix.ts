/**
 * Pix: cadastro de chave e geração do "copia e cola" (spec §9.2).
 *
 * Tudo aqui é offline. O BR Code é montado no aparelho segundo o padrão EMV do
 * Banco Central — nenhuma API, nenhuma chave de terceiro, nada que precise de
 * rede no meio da viagem. É o que permite fechar as contas no aeroporto, sem
 * sinal, e cada um sair com o pagamento pronto para colar no banco.
 */
import { toDecimalString } from './money';
import { err, invariant, ok, type Result } from './result';

export type PixKeyKind = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface PixKey {
  readonly kind: PixKeyKind;
  /** Chave já normalizada, no formato que o BR Code exige. */
  readonly value: string;
}

export type PixKeyError =
  | { readonly code: 'empty' }
  | { readonly code: 'unrecognized' }
  | { readonly code: 'invalid_cpf' }
  | { readonly code: 'invalid_cnpj' }
  | { readonly code: 'too_long'; readonly max: number };

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/u;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MAX_KEY_LENGTH = 77;

function digitsOnly(value: string): string {
  return value.replace(/\D/gu, '');
}

function checkDigits(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce<number>((acc, weight, i) => acc + weight * Number(digits[i] ?? 0), 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(input: string): boolean {
  const d = digitsOnly(input);
  if (d.length !== 11 || /^(\d)\1{10}$/u.test(d)) return false;
  const first = checkDigits(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigits(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(d[9]) === first && Number(d[10]) === second;
}

export function isValidCnpj(input: string): boolean {
  const d = digitsOnly(input);
  if (d.length !== 14 || /^(\d)\1{13}$/u.test(d)) return false;
  const first = checkDigits(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigits(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(d[12]) === first && Number(d[13]) === second;
}

/**
 * Reconhece o tipo da chave pelo formato e normaliza.
 *
 * Validar CPF e CNPJ pelos dígitos verificadores não é preciosismo: uma chave
 * errada só aparece na hora de pagar, quando o grupo já se separou.
 */
export function parsePixKey(input: string): Result<PixKey, PixKeyError> {
  const raw = input.trim();
  if (raw === '') return err({ code: 'empty' });
  if (raw.length > MAX_KEY_LENGTH) return err({ code: 'too_long', max: MAX_KEY_LENGTH });

  if (UUID_RE.test(raw.toLowerCase())) return ok({ kind: 'random', value: raw.toLowerCase() });
  if (raw.includes('@')) {
    return EMAIL_RE.test(raw) ? ok({ kind: 'email', value: raw.toLowerCase() }) : err({ code: 'unrecognized' });
  }

  const digits = digitsOnly(raw);

  if (raw.startsWith('+') || digits.length === 13 || digits.length === 12) {
    const national = digits.startsWith('55') ? digits.slice(2) : digits;
    if (national.length === 10 || national.length === 11) return ok({ kind: 'phone', value: `+55${national}` });
    return err({ code: 'unrecognized' });
  }

  if (digits.length === 11) {
    if (isValidCpf(digits)) return ok({ kind: 'cpf', value: digits });
    // 11 dígitos que não são CPF válido ainda podem ser um celular sem o +55.
    if (digits[2] === '9') return ok({ kind: 'phone', value: `+55${digits}` });
    return err({ code: 'invalid_cpf' });
  }

  if (digits.length === 14) {
    return isValidCnpj(digits) ? ok({ kind: 'cnpj', value: digits }) : err({ code: 'invalid_cnpj' });
  }

  if (digits.length === 10) return ok({ kind: 'phone', value: `+55${digits}` });

  return err({ code: 'unrecognized' });
}

/** Máscara para exibir a chave sem expor o número inteiro na tela do grupo. */
export function maskPixKey(key: PixKey): string {
  switch (key.kind) {
    case 'cpf':
      return `***.${key.value.slice(3, 6)}.${key.value.slice(6, 9)}-**`;
    case 'cnpj':
      return `**.${key.value.slice(2, 5)}.${key.value.slice(5, 8)}/****-**`;
    case 'phone':
      return `+55 (${key.value.slice(3, 5)}) ****-${key.value.slice(-4)}`;
    case 'email': {
      const [user = '', domain = ''] = key.value.split('@');
      return `${user.slice(0, 2)}***@${domain}`;
    }
    case 'random':
      return `${key.value.slice(0, 8)}…${key.value.slice(-4)}`;
  }
}

// ---------------------------------------------------------------------------
// BR Code (Pix copia e cola)
// ---------------------------------------------------------------------------

const PIX_GUI = 'br.gov.bcb.pix';

function tlv(id: string, value: string): string {
  invariant(id.length === 2, `Id EMV deve ter 2 dígitos: ${id}`);
  invariant(value.length <= 99, `Valor EMV longo demais no campo ${id}.`);
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE: polinômio 0x1021, inicial 0xFFFF, sem reflexão. */
export function crc16(input: string): number {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * O motor implementa normalização Unicode?
 *
 * O Hermes não implementa `String.prototype.normalize` com decomposição, e o
 * caminho baseado nela devolveria o nome com acento — que o padrão do BR Code
 * não aceita, gerando um código que o banco recusa. A sondagem roda uma vez.
 */
const HAS_UNICODE_NORMALIZE = ((): boolean => {
  try {
    return 'é'.normalize('NFD').length === 2;
  } catch {
    return false;
  }
})();

/** Mapa de reserva, cobrindo o que aparece em nome e cidade no Brasil. */
const DIACRITICS: Readonly<Record<string, string>> = {
  á: 'a', à: 'a', ã: 'a', â: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', õ: 'o', ô: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n', ý: 'y',
};

/**
 * Caminho que roda no aparelho, sem normalização Unicode. Exportado para o
 * teste poder exercitá-lo mesmo num motor que tenha `normalize`.
 */
export function stripDiacriticsFallback(text: string): string {
  let result = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    const plain = DIACRITICS[lower];
    if (plain === undefined) {
      result += char;
    } else {
      result += char === lower ? plain : plain.toUpperCase();
    }
  }
  return result;
}

export function stripDiacritics(text: string): string {
  if (HAS_UNICODE_NORMALIZE) return text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
  return stripDiacriticsFallback(text);
}

/** Remove acentos e caracteres que o padrão não aceita, e corta no limite. */
function sanitize(text: string, maxLength: number): string {
  const stripped = stripDiacritics(text)
    .replace(/[^A-Za-z0-9 .-]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return stripped.slice(0, maxLength);
}

export interface PixPayloadInput {
  readonly key: PixKey;
  /** Nome de quem RECEBE. */
  readonly receiverName: string;
  readonly city: string;
  /** Em centavos de real. Omitido = o pagador digita o valor. */
  readonly amountCents?: number;
  /** Identificador da cobrança, até 25 caracteres. */
  readonly txid?: string;
}

/**
 * Monta o "copia e cola" do Pix.
 *
 * O valor vai embutido, então ninguém digita R$ 1.902,40 errado na pressa —
 * que é exatamente o tipo de erro que reabre a conta depois da viagem.
 */
export function buildPixPayload(input: PixPayloadInput): string {
  const { key, receiverName, city, amountCents, txid } = input;
  invariant(
    amountCents === undefined || (Number.isSafeInteger(amountCents) && amountCents > 0),
    'Valor do Pix deve ser inteiro positivo.',
  );

  const name = sanitize(receiverName, 25) || 'PAGAMENTO';
  const merchantCity = sanitize(city, 15) || 'BRASIL';
  const reference = sanitize(txid ?? '', 25).replace(/[^A-Za-z0-9]/gu, '') || '***';

  const merchantAccount = tlv('00', PIX_GUI) + tlv('01', key.value);

  const fields = [
    tlv('00', '01'),
    tlv('01', amountCents === undefined ? '11' : '12'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '986'),
    ...(amountCents === undefined ? [] : [tlv('54', toDecimalString(amountCents, 2))]),
    tlv('58', 'BR'),
    tlv('59', name),
    tlv('60', merchantCity),
    tlv('62', tlv('05', reference)),
  ].join('');

  const withCrcHeader = `${fields}6304`;
  return withCrcHeader + crc16(withCrcHeader).toString(16).toUpperCase().padStart(4, '0');
}

export interface PixField {
  readonly id: string;
  readonly value: string;
}

/** Lê um BR Code de volta em campos. Existe para os testes e para conferência. */
export function parseEmvFields(payload: string): PixField[] {
  const fields: PixField[] = [];
  let cursor = 0;
  while (cursor + 4 <= payload.length) {
    const id = payload.slice(cursor, cursor + 2);
    const length = Number(payload.slice(cursor + 2, cursor + 4));
    invariant(Number.isInteger(length), `Comprimento inválido no campo ${id}.`);
    const value = payload.slice(cursor + 4, cursor + 4 + length);
    invariant(value.length === length, `Campo ${id} truncado.`);
    fields.push({ id, value });
    cursor += 4 + length;
  }
  invariant(cursor === payload.length, 'Sobrou conteúdo no fim do BR Code.');
  return fields;
}

/** Confere o CRC de um BR Code recebido de fora. */
export function isValidPixPayload(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4);
  if (!body.endsWith('6304')) return false;
  return crc16(body).toString(16).toUpperCase().padStart(4, '0') === payload.slice(-4).toUpperCase();
}
