import { describe, expect, it } from 'vitest';
import {
  addParticipant,
  createExpense,
  createTrip,
  mergeParticipants,
  recordSettlement,
} from '@/commands/index';
import { listParticipants, loadLedger } from '@/db/repositories';
import { computeBalances } from '@/domain/balance';
import { sumCents } from '@/domain/money';
import { simplifyDebts } from '@/domain/settle';
import { makeContext, openTestDb } from './_harness';

function cenario() {
  const db = openTestDb();
  const ctx = makeContext();
  const tripId = createTrip(db, ctx, { name: 'Japão', baseCurrency: 'BRL' });

  const novo = (nome: string): string => {
    const r = addParticipant(db, ctx, { tripId, displayName: nome });
    if (!r.ok) throw new Error('participante não criado');
    return r.value;
  };

  // A Ana foi cadastrada duas vezes: uma pelo nome, no primeiro dia, e outra
  // quando entrou pelo link do convite sem escolher quem era (§7.2).
  const anaFantasma = novo('Ana');
  const anaConta = novo('Ana (conta)');
  const bruno = novo('Bruno');

  return { db, ctx, tripId, anaFantasma, anaConta, bruno };
}

describe('mesclar participantes duplicados', () => {
  it('soma as partes quando os dois estão na mesma despesa', () => {
    const { db, ctx, tripId, anaFantasma, anaConta, bruno } = cenario();

    createExpense(db, ctx, {
      tripId,
      description: 'Jantar',
      amountCents: 9000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: bruno,
      split: { type: 'equal', participantIds: [anaFantasma, anaConta, bruno] },
    });

    expect(mergeParticipants(db, ctx, { loserId: anaFantasma, winnerId: anaConta }).ok).toBe(true);

    const ledger = loadLedger(db, tripId);
    const partes = ledger.expenses[0]?.shares ?? [];
    // Nada duplicado, nada descartado: 3.000 + 3.000 numa parte só.
    expect(partes).toHaveLength(2);
    expect(partes.find((p) => p.participantId === anaConta)?.cents).toBe(6000);
    expect(sumCents(partes.map((p) => p.cents))).toBe(9000);
  });

  it('preserva os saldos e mantém a soma em zero', () => {
    const { db, ctx, tripId, anaFantasma, anaConta, bruno } = cenario();

    createExpense(db, ctx, {
      tripId,
      description: 'Hotel',
      amountCents: 30_000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-12',
      paidBy: anaFantasma,
      split: { type: 'equal', participantIds: [anaFantasma, bruno] },
    });
    createExpense(db, ctx, {
      tripId,
      description: 'Táxi',
      amountCents: 6000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-13',
      paidBy: bruno,
      split: { type: 'equal', participantIds: [anaConta, bruno] },
    });

    const antes = computeBalances(loadLedger(db, tripId)).balances;
    const somaAna =
      (antes.find((b) => b.participantId === anaFantasma)?.cents ?? 0) +
      (antes.find((b) => b.participantId === anaConta)?.cents ?? 0);

    expect(mergeParticipants(db, ctx, { loserId: anaFantasma, winnerId: anaConta }).ok).toBe(true);

    const depois = computeBalances(loadLedger(db, tripId));
    expect(depois.residualCents).toBe(0);
    expect(sumCents(depois.balances.map((b) => b.cents))).toBe(0);
    expect(depois.balances.find((b) => b.participantId === anaConta)?.cents).toBe(somaAna);
    expect(depois.balances.map((b) => b.participantId)).not.toContain(anaFantasma);
  });

  it('reatribui os acertos e encerra o que viraria pagamento para si mesmo', () => {
    const { db, ctx, tripId, anaFantasma, anaConta, bruno } = cenario();

    createExpense(db, ctx, {
      tripId,
      description: 'Hotel',
      amountCents: 20_000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-12',
      paidBy: anaFantasma,
      split: { type: 'equal', participantIds: [anaFantasma, bruno] },
    });
    recordSettlement(db, ctx, {
      tripId,
      fromId: bruno,
      toId: anaFantasma,
      amountCents: 4000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      settledOn: '2026-03-20',
    });
    // Este perde o sentido depois da mesclagem: seria a Ana pagando à Ana.
    recordSettlement(db, ctx, {
      tripId,
      fromId: anaConta,
      toId: anaFantasma,
      amountCents: 1000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      settledOn: '2026-03-21',
    });

    expect(mergeParticipants(db, ctx, { loserId: anaFantasma, winnerId: anaConta }).ok).toBe(true);

    const ledger = loadLedger(db, tripId);
    expect(ledger.settlements).toHaveLength(1);
    expect(ledger.settlements[0]?.toId).toBe(anaConta);

    const saldos = computeBalances(ledger);
    expect(saldos.residualCents).toBe(0);
    expect(simplifyDebts(saldos.balances)).toEqual([
      { fromId: bruno, toId: anaConta, cents: 6000 },
    ]);
  });

  it('o participante mesclado some da lista, mas o histórico continua', () => {
    const { db, ctx, tripId, anaFantasma, anaConta } = cenario();
    expect(mergeParticipants(db, ctx, { loserId: anaFantasma, winnerId: anaConta }).ok).toBe(true);

    expect(listParticipants(db, tripId).map((p) => p.id)).not.toContain(anaFantasma);
    const linha = db.get<{ merged_into: string }>('SELECT merged_into FROM participants WHERE id = ?', [
      anaFantasma,
    ]);
    expect(linha?.merged_into).toBe(anaConta);
  });

  it('recusa mesclar alguém consigo mesmo', () => {
    const { db, ctx, anaConta } = cenario();
    expect(mergeParticipants(db, ctx, { loserId: anaConta, winnerId: anaConta })).toEqual({
      ok: false,
      error: { code: 'same_participant' },
    });
  });
});
