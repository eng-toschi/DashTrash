/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { IOF_DEFAULT_PPM, paidAmount, suggestIofPpm, PAYMENT_METHODS } from '@/domain/payment';
import { computeBalances, expenseInBase, totalIof, type TripLedger } from '@/domain/balance';
import { sumCents } from '@/domain/money';
import { DomainError } from '@/domain/result';
import { ledgerArbitrary } from './_trips';

describe('IOF', () => {
  it('decompõe o custo real de um gasto no cartão', () => {
    // ¥12.400 a 0,037 = R$ 458,80; com 3,5% de IOF a fatura cobra R$ 474,86.
    const result = paidAmount(12_400, 'JPY', 'BRL', 37_000, 35_000);
    expect(result.netCents).toBe(45_880);
    expect(result.iofCents).toBe(1606);
    expect(result.totalCents).toBe(47_486);
  });

  it('não cobra IOF quando não há câmbio', () => {
    expect(suggestIofPpm('credit_card', 'BRL', 'BRL')).toBe(0);
    expect(suggestIofPpm('no_fx', 'JPY', 'BRL')).toBe(0);
    expect(paidAmount(10_000, 'BRL', 'BRL', 1_000_000, 0).iofCents).toBe(0);
  });

  it('sugere 3,5% para cartão, espécie e conta global', () => {
    expect(suggestIofPpm('credit_card', 'JPY', 'BRL')).toBe(35_000);
    expect(suggestIofPpm('debit_card', 'JPY', 'BRL')).toBe(35_000);
    expect(suggestIofPpm('cash_fx', 'JPY', 'BRL')).toBe(35_000);
    expect(suggestIofPpm('global_account', 'JPY', 'BRL')).toBe(35_000);
  });

  it('cobre todas as formas de pagamento na tabela de alíquotas', () => {
    for (const method of PAYMENT_METHODS) {
      expect(IOF_DEFAULT_PPM[method]).toBeGreaterThanOrEqual(0);
    }
  });

  it('recusa alíquota negativa', () => {
    expect(() => paidAmount(1000, 'JPY', 'BRL', 37_000, -1)).toThrow(DomainError);
  });

  it('PROPRIEDADE: a decomposição sempre fecha (líquido + IOF = total)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000_000 }),
        fc.integer({ min: 1000, max: 20_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (cents, ratePpm, iofPpm) => {
          const result = paidAmount(cents, 'USD', 'BRL', ratePpm, iofPpm);
          expect(result.netCents + result.iofCents).toBe(result.totalCents);
          expect(result.iofCents).toBeGreaterThanOrEqual(0);
          return true;
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('IOF dentro da despesa', () => {
  const comIof = {
    id: 'jantar',
    amountCents: 12_400,
    currency: 'JPY',
    fxRatePpm: 37_000,
    iofPpm: 35_000,
    paidBy: 'ana',
    shares: [
      { participantId: 'ana', cents: 3100 },
      { participantId: 'bruno', cents: 3100 },
      { participantId: 'carla', cents: 3100 },
      { participantId: 'davi', cents: 3100 },
    ],
  };

  it('o pagador é reembolsado pelo que a fatura vai cobrar, IOF incluído', () => {
    const base = expenseInBase(comIof, 'BRL');
    expect(base.totalCents).toBe(47_486);
    expect(base.iofCents).toBe(1606);
    expect(sumCents(base.shares.map((s) => s.cents))).toBe(47_486);
  });

  it('divide o IOF na mesma proporção do consumo', () => {
    const base = expenseInBase(comIof, 'BRL');
    // 47.486 / 4 = 11.871,5 -> duas partes de 11.872 e duas de 11.871.
    expect(base.shares.map((s) => s.cents)).toEqual([11_872, 11_872, 11_871, 11_871]);
  });

  it('mantém os saldos somando zero', () => {
    const ledger: TripLedger = {
      baseCurrency: 'BRL',
      participantIds: ['ana', 'bruno', 'carla', 'davi'],
      expenses: [comIof],
      settlements: [],
    };
    const report = computeBalances(ledger);
    expect(report.residualCents).toBe(0);
    expect(sumCents(report.balances.map((b) => b.cents))).toBe(0);
    expect(totalIof(ledger)).toBe(1606);
  });

  it('uma despesa sem IOF declarado se comporta como antes', () => {
    const { iofPpm: _omitido, ...semIof } = comIof;
    const base = expenseInBase({ ...comIof, iofPpm: 0 }, 'BRL');
    expect(base.totalCents).toBe(45_880);
    expect(base.iofCents).toBe(0);
    expect(expenseInBase(semIof, 'BRL').totalCents).toBe(45_880);
  });

  it('PROPRIEDADE: com IOF sorteado, os saldos continuam somando zero', () => {
    fc.assert(
      fc.property(ledgerArbitrary(), (ledger) => {
        const report = computeBalances(ledger);
        expect(report.residualCents).toBe(0);
        expect(totalIof(ledger)).toBeGreaterThanOrEqual(0);
        return true;
      }),
      { numRuns: 300 },
    );
  });
});
