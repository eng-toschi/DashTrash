import { describe, expect, it } from 'vitest';
import {
  addParticipant,
  createExpense,
  createTrip,
  recordSettlement,
  updateParticipant,
} from '@/commands';
import { findMe, listParticipants, loadLedger, localActorId } from '@/db/repositories';
import { computeBalances, totalIof, totalSpent } from '@/domain/balance';
import { sumCents } from '@/domain/money';
import { buildPixPayload, isValidPixPayload, parsePixKey } from '@/domain/pix';
import { applyTransfers, paymentOptions, simplifyDebts } from '@/domain/settle';
import { makeContext, openTestDb } from './_harness';

/**
 * O fluxo completo que o app precisa entregar na Fase 3, percorrido pela mesma
 * camada que as telas usam: criar viagem, lançar em três moedas com subgrupo,
 * conferir saldos, fechar e zerar todo mundo.
 *
 * Substitui parcialmente o E2E #1 do spec, que exige emulador.
 */
describe('viagem de ponta a ponta', () => {
  it('do cadastro ao fechamento, com todo mundo zerado', () => {
    const db = openTestDb();
    const ctx = makeContext();

    const tripId = createTrip(db, ctx, {
      name: 'Japão',
      baseCurrency: 'BRL',
      startsOn: '2026-03-12',
      endsOn: '2026-03-26',
    });

    const voce = addParticipant(db, ctx, {
      tripId,
      displayName: 'Você',
      userId: localActorId(db),
    });
    const ana = addParticipant(db, ctx, { tripId, displayName: 'Ana' });
    const bruno = addParticipant(db, ctx, { tripId, displayName: 'Bruno' });
    const carla = addParticipant(db, ctx, { tripId, displayName: 'Carla' });
    if (!voce.ok || !ana.ok || !bruno.ok || !carla.ok) throw new Error('participantes não criados');

    const todos = [voce.value, ana.value, bruno.value, carla.value];

    // A tela sabe quem é "você" sem existir login ainda.
    expect(findMe(db, tripId)?.id).toBe(voce.value);
    expect(listParticipants(db, tripId)).toHaveLength(4);

    // Hotel em ienes, no cartão, dividido entre todos.
    expect(
      createExpense(db, ctx, {
        tripId,
        description: 'Hotel Shinjuku',
        category: 'lodging',
        amountCents: 96_000,
        currency: 'JPY',
        fxRatePpm: 37_000,
        fxAsOf: '2026-03-13',
        paymentMethod: 'credit_card',
        iofPpm: 35_000,
        spentOn: '2026-03-13',
        paidBy: ana.value,
        split: { type: 'equal', participantIds: todos },
      }).ok,
    ).toBe(true);

    // Táxi só para duas pessoas — o subgrupo, que é o caso normal na viagem.
    expect(
      createExpense(db, ctx, {
        tripId,
        description: 'Táxi para Shinjuku',
        category: 'transport',
        amountCents: 4200,
        currency: 'JPY',
        fxRatePpm: 37_000,
        paymentMethod: 'cash_fx',
        iofPpm: 35_000,
        spentOn: '2026-03-14',
        paidBy: bruno.value,
        split: { type: 'equal', participantIds: [voce.value, bruno.value] },
      }).ok,
    ).toBe(true);

    // Jantar em reais, por valor exato.
    expect(
      createExpense(db, ctx, {
        tripId,
        description: 'Jantar de chegada',
        category: 'restaurant',
        amountCents: 24_000,
        currency: 'BRL',
        fxRatePpm: 1_000_000,
        paymentMethod: 'no_fx',
        spentOn: '2026-03-12',
        paidBy: carla.value,
        split: {
          type: 'exact',
          entries: [
            { participantId: voce.value, cents: 8000 },
            { participantId: ana.value, cents: 6000 },
            { participantId: bruno.value, cents: 6000 },
            { participantId: carla.value, cents: 4000 },
          ],
        },
      }).ok,
    ).toBe(true);

    const ledger = loadLedger(db, tripId);
    const report = computeBalances(ledger);

    expect(report.residualCents).toBe(0);
    expect(sumCents(report.balances.map((b) => b.cents))).toBe(0);
    // ¥96.000 a 0,037 = R$ 3.552,00, com 3,5% de IOF = R$ 3.676,32.
    // ¥4.200 pelo mesmo caminho = R$ 160,84. Mais R$ 240,00 do jantar em reais.
    expect(totalSpent(ledger)).toBe(367_632 + 16_084 + 24_000);
    expect(totalIof(ledger)).toBe(12_432 + 544);

    // Fechamento: no máximo n-1 transferências, e elas quitam todo mundo.
    const transfers = simplifyDebts(report.balances);
    expect(transfers.length).toBeLessThanOrEqual(3);
    expect(applyTransfers(report.balances, transfers).every((b) => b.cents === 0)).toBe(true);

    // Cada transferência pode ser paga em reais ou na moeda da viagem.
    const primeira = transfers[0];
    if (primeira === undefined) throw new Error('sem transferências');
    const opcoes = paymentOptions(primeira, 'BRL', [{ currency: 'JPY', ratePpm: 37_000 }]);
    expect(opcoes[0]?.currency).toBe('BRL');
    expect(opcoes[1]?.currency).toBe('JPY');
    expect(opcoes[1]?.cents).toBeGreaterThan(0);

    // Com Pix cadastrado, o código sai pronto com o valor embutido.
    expect(
      updateParticipant(db, ctx, {
        participantId: primeira.toId,
        pixKey: '11144477735',
        pixKeyKind: 'cpf',
        pixName: 'Recebedor',
        pixCity: 'Sao Paulo',
      }).ok,
    ).toBe(true);

    const chave = parsePixKey('11144477735');
    if (!chave.ok) throw new Error('chave inválida');
    const codigo = buildPixPayload({
      key: chave.value,
      receiverName: 'Recebedor',
      city: 'Sao Paulo',
      amountCents: primeira.cents,
    });
    expect(isValidPixPayload(codigo)).toBe(true);

    // Registrar os pagamentos zera a viagem.
    for (const transfer of transfers) {
      expect(
        recordSettlement(db, ctx, {
          tripId,
          fromId: transfer.fromId,
          toId: transfer.toId,
          amountCents: transfer.cents,
          currency: 'BRL',
          fxRatePpm: 1_000_000,
          settledOn: '2026-03-26',
        }).ok,
      ).toBe(true);
    }

    const fechado = computeBalances(loadLedger(db, tripId));
    expect(fechado.balances.every((b) => b.cents === 0)).toBe(true);
    expect(simplifyDebts(fechado.balances)).toEqual([]);
  });
});
