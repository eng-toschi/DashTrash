import { describe, expect, it } from 'vitest';
import {
  addParticipant,
  createExpense,
  createTrip,
  deleteExpense,
  linkParticipantToUser,
  recordSettlement,
  restoreExpense,
  updateExpense,
} from '@/commands/index.js';
import { listExpenses, listShares, listSubgroups, loadLedger } from '@/db/repositories.js';
import { computeBalances, expenseInBase } from '@/domain/balance.js';
import { sumCents } from '@/domain/money.js';
import { pendingCount, pendingOps } from '@/sync/outbox.js';
import { makeContext, openTestDb } from './_harness.js';

function viagemComQuatro() {
  const db = openTestDb();
  const ctx = makeContext();
  const tripId = createTrip(db, ctx, { name: 'Japão', baseCurrency: 'BRL' });
  const ids = ['Ana', 'Bruno', 'Carla', 'Davi'].map((nome) => {
    const result = addParticipant(db, ctx, { tripId, displayName: nome });
    if (!result.ok) throw new Error('participante não criado');
    return result.value;
  });
  return { db, ctx, tripId, ids };
}

describe('criação de despesa', () => {
  it('grava despesa, partes e uma operação, e o saldo fecha', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno, carla, davi] = ids as [string, string, string, string];

    const result = createExpense(db, ctx, {
      tripId,
      description: 'Jantar em Shibuya',
      category: 'restaurant',
      amountCents: 12_400,
      currency: 'JPY',
      fxRatePpm: 37_000,
      fxAsOf: '2026-03-14',
      paymentMethod: 'credit_card',
      iofPpm: 35_000,
      spentOn: '2026-03-14',
      paidBy: carla,
      split: { type: 'equal', participantIds: [ana, bruno, carla, davi] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(listExpenses(db, tripId)).toHaveLength(1);
    expect(listShares(db, result.value)).toHaveLength(4);

    const saldos = computeBalances(loadLedger(db, tripId));
    expect(saldos.residualCents).toBe(0);
    expect(sumCents(saldos.balances.map((b) => b.cents))).toBe(0);
    // ¥12.400 a 0,037 com 3,5% de IOF = R$ 474,86, rateado entre quatro.
    // Qual deles fica com o centavo do resto é decidido pelo id (determinístico,
    // mas não é o teste aqui) — o que importa é o total e o saldo do pagador.
    // As partes gravadas ficam na MOEDA DA DESPESA; a conversão para a
    // moeda-base é do domínio, não do banco.
    const partesEmIene = listShares(db, result.value);
    expect(sumCents(partesEmIene.map((p) => p.cents))).toBe(12_400);

    const despesa = loadLedger(db, tripId).expenses[0];
    if (despesa === undefined) throw new Error('despesa não carregada');
    const emReais = expenseInBase(despesa, 'BRL');
    expect(emReais.totalCents).toBe(47_486);
    expect(emReais.iofCents).toBe(1606);

    const parteDaCarla = emReais.shares.find((p) => p.participantId === carla)?.cents ?? 0;
    expect([11_871, 11_872]).toContain(parteDaCarla);
    expect(saldos.balances.find((b) => b.participantId === carla)?.cents).toBe(47_486 - parteDaCarla);
  });

  it('recusa divisão exata que não fecha, e não escreve nada', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno] = ids as [string, string, ...string[]];
    const antes = pendingCount(db);

    const result = createExpense(db, ctx, {
      tripId,
      description: 'Táxi',
      amountCents: 10_000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: {
        type: 'exact',
        entries: [
          { participantId: ana, cents: 5000 },
          { participantId: bruno, cents: 1660 },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'split', error: { code: 'exact_mismatch', differenceCents: 3340 } },
    });
    expect(listExpenses(db, tripId)).toHaveLength(0);
    expect(pendingCount(db)).toBe(antes);
  });

  it('recusa participante que não é da viagem', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const result = createExpense(db, ctx, {
      tripId,
      description: 'Táxi',
      amountCents: 1000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ids[0] ?? '',
      split: { type: 'equal', participantIds: ['estranho'] },
    });
    expect(result).toEqual({ ok: false, error: { code: 'participant_not_found', participantId: 'estranho' } });
  });
});

describe('atomicidade', () => {
  it('ESTADO E OPERAÇÃO entram juntos, ou não entra nada', () => {
    const { db, tripId, ids } = viagemComQuatro();
    const [ana, bruno] = ids as [string, string, ...string[]];

    // Sabotagem: a despesa recebe um id novo, mas a OPERAÇÃO reaproveita o id de
    // uma já existente. O insert no outbox viola a chave primária no meio da
    // transação, depois de a despesa já ter sido escrita.
    const idJaUsado = pendingOps(db)[0]?.id ?? '';
    let primeiro = true;
    const sabotado = {
      newId: () => {
        if (primeiro) {
          primeiro = false;
          return 'despesa-nova';
        }
        return idJaUsado;
      },
      now: () => '2026-03-14T12:00:00.000Z',
    };

    const despesasAntes = listExpenses(db, tripId).length;
    const opsAntes = pendingCount(db);

    expect(() =>
      createExpense(db, sabotado, {
        tripId,
        description: 'Vai falhar',
        amountCents: 5000,
        currency: 'BRL',
        fxRatePpm: 1_000_000,
        spentOn: '2026-03-14',
        paidBy: ana,
        split: { type: 'equal', participantIds: [ana, bruno] },
      }),
    ).toThrow();

    // Sem a co-localização na mesma transação, a despesa teria ficado aqui e
    // nunca chegaria aos outros aparelhos.
    expect(listExpenses(db, tripId)).toHaveLength(despesasAntes);
    expect(pendingCount(db)).toBe(opsAntes);
  });
});

describe('edição e exclusão', () => {
  it('a edição substitui as partes em bloco, sem deixar sobra', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno, carla] = ids as [string, string, string, ...string[]];

    const criada = createExpense(db, ctx, {
      tripId,
      description: 'Jantar',
      amountCents: 9000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: { type: 'equal', participantIds: [ana, bruno, carla] },
    });
    if (!criada.ok) throw new Error('não criou');

    const atualizada = updateExpense(db, ctx, criada.value, {
      tripId,
      description: 'Jantar (só nós dois)',
      amountCents: 9000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: { type: 'equal', participantIds: [ana, bruno] },
    });

    expect(atualizada.ok).toBe(true);
    const partes = listShares(db, criada.value);
    expect(partes).toHaveLength(2);
    expect(sumCents(partes.map((p) => p.cents))).toBe(9000);
    expect(partes.map((p) => p.participantId)).not.toContain(carla);
  });

  it('excluir é tombstone, com undo', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno] = ids as [string, string, ...string[]];

    const criada = createExpense(db, ctx, {
      tripId,
      description: 'Táxi',
      amountCents: 3000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: { type: 'equal', participantIds: [ana, bruno] },
    });
    if (!criada.ok) throw new Error('não criou');

    expect(deleteExpense(db, ctx, criada.value).ok).toBe(true);
    expect(listExpenses(db, tripId)).toHaveLength(0);
    expect(loadLedger(db, tripId).expenses).toHaveLength(0);

    const ultima = pendingOps(db).at(-1);
    expect(ultima?.kind).toBe('delete');
    expect(ultima?.entity).toBe('expense');

    // A linha continua lá, então o undo é só voltar o tombstone.
    expect(restoreExpense(db, ctx, criada.value).ok).toBe(true);
    expect(listExpenses(db, tripId)).toHaveLength(1);
  });
});

describe('acertos', () => {
  it('reduzem o saldo dos dois lados', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno] = ids as [string, string, ...string[]];

    createExpense(db, ctx, {
      tripId,
      description: 'Hotel',
      amountCents: 20_000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: { type: 'equal', participantIds: [ana, bruno] },
    });

    expect(
      recordSettlement(db, ctx, {
        tripId,
        fromId: bruno,
        toId: ana,
        amountCents: 4000,
        currency: 'BRL',
        fxRatePpm: 1_000_000,
        settledOn: '2026-03-20',
      }).ok,
    ).toBe(true);

    const saldos = computeBalances(loadLedger(db, tripId)).balances;
    expect(saldos.find((b) => b.participantId === ana)?.cents).toBe(6000);
    expect(saldos.find((b) => b.participantId === bruno)?.cents).toBe(-6000);
  });

  it('recusa acerto de alguém para si mesmo', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const ana = ids[0] ?? '';
    expect(
      recordSettlement(db, ctx, {
        tripId,
        fromId: ana,
        toId: ana,
        amountCents: 100,
        currency: 'BRL',
        fxRatePpm: 1_000_000,
        settledOn: '2026-03-20',
      }),
    ).toEqual({ ok: false, error: { code: 'same_participant' } });
  });
});

describe('subgrupos salvos', () => {
  it('guarda a combinação quando a divisão é de um subgrupo', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno, carla] = ids as [string, string, string, ...string[]];

    createExpense(db, ctx, {
      tripId,
      description: 'Jantar',
      amountCents: 9000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: { type: 'equal', participantIds: [ana, bruno, carla] },
    });

    const subgrupos = listSubgroups(db, tripId);
    expect(subgrupos).toHaveLength(1);
    expect(subgrupos[0]?.participantIds).toEqual([ana, bruno, carla].sort());
  });

  it('não guarda quando a divisão é entre todos', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    createExpense(db, ctx, {
      tripId,
      description: 'Hotel',
      amountCents: 8000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ids[0] ?? '',
      split: { type: 'equal', participantIds: ids },
    });
    expect(listSubgroups(db, tripId)).toHaveLength(0);
  });
});

describe('convite e vinculação', () => {
  it('vincular a conta faz a pessoa herdar as despesas já lançadas', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno] = ids as [string, string, ...string[]];

    createExpense(db, ctx, {
      tripId,
      description: 'Hotel',
      amountCents: 20_000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: { type: 'equal', participantIds: [ana, bruno] },
    });

    expect(linkParticipantToUser(db, ctx, { participantId: bruno, userId: 'user-bruno' }).ok).toBe(true);

    const saldos = computeBalances(loadLedger(db, tripId)).balances;
    expect(saldos.find((b) => b.participantId === bruno)?.cents).toBe(-10_000);
  });

  it('impede a mesma conta em dois participantes vivos', () => {
    const { db, ctx, ids } = viagemComQuatro();
    const [ana, bruno] = ids as [string, string, ...string[]];

    linkParticipantToUser(db, ctx, { participantId: ana, userId: 'user-x' });
    expect(linkParticipantToUser(db, ctx, { participantId: bruno, userId: 'user-x' })).toEqual({
      ok: false,
      error: { code: 'user_already_linked', participantId: ana },
    });
  });
});

describe('outbox', () => {
  it('drena na ordem em que as coisas aconteceram, com Lamport crescente', () => {
    const { db } = viagemComQuatro();
    const ops = pendingOps(db);

    expect(ops.length).toBeGreaterThan(0);
    expect(ops.map((o) => o.seq)).toEqual([...ops].map((o) => o.seq).sort((a, b) => a - b));
    for (let i = 1; i < ops.length; i += 1) {
      expect(ops[i]?.lamport).toBeGreaterThan(ops[i - 1]?.lamport ?? 0);
    }
    expect(ops[0]?.entity).toBe('trip');
  });

  it('a operação carrega a despesa inteira, com as partes juntas', () => {
    const { db, ctx, tripId, ids } = viagemComQuatro();
    const [ana, bruno] = ids as [string, string, ...string[]];

    createExpense(db, ctx, {
      tripId,
      description: 'Táxi',
      amountCents: 3000,
      currency: 'BRL',
      fxRatePpm: 1_000_000,
      spentOn: '2026-03-14',
      paidBy: ana,
      split: { type: 'equal', participantIds: [ana, bruno] },
    });

    const payload = pendingOps(db).at(-1)?.payload as { shares: unknown[] };
    expect(payload.shares).toHaveLength(2);
  });
});
