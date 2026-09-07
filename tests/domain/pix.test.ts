import { describe, expect, it } from 'vitest';
import {
  buildPixPayload,
  crc16,
  isValidCnpj,
  isValidCpf,
  isValidPixPayload,
  maskPixKey,
  parseEmvFields,
  parsePixKey,
  type PixKey,
} from '@/domain/pix';

const field = (payload: string, id: string): string | undefined =>
  parseEmvFields(payload).find((f) => f.id === id)?.value;

describe('CRC-16/CCITT-FALSE', () => {
  it('bate com o vetor de referência do algoritmo', () => {
    // "123456789" -> 0x29B1 é o vetor canônico do CRC-16/CCITT-FALSE.
    expect(crc16('123456789')).toBe(0x29b1);
  });

  it('muda com qualquer alteração no conteúdo', () => {
    expect(crc16('123456789')).not.toBe(crc16('123456780'));
  });
});

describe('documentos', () => {
  it('valida CPF pelos dígitos verificadores', () => {
    expect(isValidCpf('111.444.777-35')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
    expect(isValidCpf('11144477700')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('valida CNPJ pelos dígitos verificadores', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000180')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });
});

describe('parsePixKey', () => {
  it.each([
    ['111.444.777-35', 'cpf', '11144477735'],
    ['11.222.333/0001-81', 'cnpj', '11222333000181'],
    ['marina@exemplo.com.br', 'email', 'marina@exemplo.com.br'],
    ['MARINA@Exemplo.com', 'email', 'marina@exemplo.com'],
    ['+55 11 99999-8888', 'phone', '+5511999998888'],
    ['11999998888', 'phone', '+5511999998888'],
    ['(11) 3333-4444', 'phone', '+551133334444'],
    ['b1f0a2c4-7d3e-4a19-9c85-2e6f0d1a3b47', 'random', 'b1f0a2c4-7d3e-4a19-9c85-2e6f0d1a3b47'],
  ])('reconhece %s como %s', (input, kind, value) => {
    expect(parsePixKey(input)).toEqual({ ok: true, value: { kind, value } });
  });

  it('recusa CPF com dígito verificador errado', () => {
    // Sem essa checagem, a chave errada só apareceria na hora de pagar,
    // quando o grupo já se separou.
    expect(parsePixKey('111.444.777-00')).toEqual({ ok: false, error: { code: 'invalid_cpf' } });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['nada disso', 'unrecognized'],
    ['sem-arroba.com', 'unrecognized'],
    ['@exemplo.com', 'unrecognized'],
    ['11.222.333/0001-80', 'invalid_cnpj'],
  ])('recusa %s', (input, code) => {
    const result = parsePixKey(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('recusa chave longa demais para o padrão', () => {
    const result = parsePixKey(`${'a'.repeat(80)}@exemplo.com`);
    expect(result).toEqual({ ok: false, error: { code: 'too_long', max: 77 } });
  });

  it('mascara a chave para não expor o documento inteiro na tela do grupo', () => {
    expect(maskPixKey({ kind: 'cpf', value: '11144477735' })).toBe('***.444.777-**');
    expect(maskPixKey({ kind: 'phone', value: '+5511999998888' })).toBe('+55 (11) ****-8888');
    expect(maskPixKey({ kind: 'email', value: 'marina@exemplo.com' })).toBe('ma***@exemplo.com');
    expect(maskPixKey({ kind: 'cnpj', value: '11222333000181' })).toBe('**.222.333/****-**');
    expect(maskPixKey({ kind: 'random', value: 'b1f0a2c4-7d3e-4a19-9c85-2e6f0d1a3b47' })).toBe('b1f0a2c4…3b47');
  });
});

describe('BR Code (copia e cola)', () => {
  const key: PixKey = { kind: 'cpf', value: '11144477735' };

  const payload = buildPixPayload({
    key,
    receiverName: 'Ana Gonçalves',
    city: 'São Paulo',
    amountCents: 190_240,
    txid: 'JAPAO2026',
  });

  it('gera um código com CRC válido', () => {
    expect(isValidPixPayload(payload)).toBe(true);
  });

  it('leva o valor embutido, com duas casas', () => {
    // R$ 1.902,40 embutido é o que evita alguém digitar o valor errado na pressa.
    expect(field(payload, '54')).toBe('1902.40');
  });

  it('declara real e Brasil', () => {
    expect(field(payload, '53')).toBe('986');
    expect(field(payload, '58')).toBe('BR');
  });

  it('marca como uso único quando tem valor fixo', () => {
    expect(field(payload, '01')).toBe('12');
    const semValor = buildPixPayload({ key, receiverName: 'Ana', city: 'Sao Paulo' });
    expect(field(semValor, '01')).toBe('11');
    expect(field(semValor, '54')).toBeUndefined();
  });

  it('carrega a chave dentro do domínio do Pix', () => {
    const merchant = field(payload, '26') ?? '';
    expect(parseEmvFields(merchant)).toEqual([
      { id: '00', value: 'br.gov.bcb.pix' },
      { id: '01', value: '11144477735' },
    ]);
  });

  it('tira acento do nome e da cidade, que o padrão não aceita', () => {
    expect(field(payload, '59')).toBe('Ana Goncalves');
    expect(field(payload, '60')).toBe('Sao Paulo');
  });

  it('corta nome e cidade nos limites do padrão', () => {
    const longo = buildPixPayload({
      key,
      receiverName: 'Maria Aparecida da Silva Xavier Rodrigues',
      city: 'Sao Jose dos Campos dos Pinhais',
      amountCents: 100,
    });
    expect((field(longo, '59') ?? '').length).toBeLessThanOrEqual(25);
    expect((field(longo, '60') ?? '').length).toBeLessThanOrEqual(15);
    expect(isValidPixPayload(longo)).toBe(true);
  });

  it('usa *** quando não há identificador', () => {
    const sem = buildPixPayload({ key, receiverName: 'Ana', city: 'Sao Paulo', amountCents: 100 });
    expect(parseEmvFields(field(sem, '62') ?? '')).toEqual([{ id: '05', value: '***' }]);
  });

  it('detecta código adulterado', () => {
    const adulterado = payload.replace('1902.40', '9902.40');
    expect(isValidPixPayload(adulterado)).toBe(false);
  });

  it('funciona com cada tipo de chave', () => {
    const chaves: PixKey[] = [
      { kind: 'cpf', value: '11144477735' },
      { kind: 'email', value: 'marina@exemplo.com' },
      { kind: 'phone', value: '+5511999998888' },
      { kind: 'random', value: 'b1f0a2c4-7d3e-4a19-9c85-2e6f0d1a3b47' },
    ];
    for (const chave of chaves) {
      const gerado = buildPixPayload({ key: chave, receiverName: 'Ana', city: 'Sao Paulo', amountCents: 5000 });
      expect(isValidPixPayload(gerado)).toBe(true);
      expect(parseEmvFields(field(gerado, '26') ?? '')[1]?.value).toBe(chave.value);
    }
  });
});
