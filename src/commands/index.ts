/**
 * Comandos de escrita (spec §4).
 *
 * Contrato de todo comando deste arquivo:
 *
 *  1. valida com o domínio, que é puro e não sabe que existe banco;
 *  2. abre UMA transação;
 *  3. altera o estado e grava a operação no outbox dentro dela;
 *  4. devolve `Result` — erro de validação é estado de tela, não exceção.
 *
 * O passo 3 é o coração do offline: ou a despesa existe aqui e está na fila
 * para os outros, ou não aconteceu nada. Nunca meio caminho.
 */
import type { Database } from '../db/driver';
import {
  getTrip,
  listActiveParticipants,
  listShares,
  type ParticipantRow,
} from '../db/repositories';
import { computeShares, type Split, type SplitError } from '../domain/split';
import { err, ok, type Result } from '../domain/result';
import { enqueue, type OpEntity } from '../sync/outbox';

export interface CommandContext {
  newId(): string;
  /** Instante em ISO. Só para exibição e auditoria — a ordem é do Lamport (§10). */
  now(): string;
}

export type CommandError =
  | { readonly code: 'trip_not_found' }
  | { readonly code: 'expense_not_found' }
  | { readonly code: 'settlement_not_found' }
  | { readonly code: 'participant_not_found'; readonly participantId: string }
  | { readonly code: 'participant_has_history'; readonly participantId: string }
  | { readonly code: 'user_already_linked'; readonly participantId: string }
  | { readonly code: 'same_participant' }
  | { readonly code: 'split'; readonly error: SplitError };

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

function participantsOf(db: Database, tripId: string): ParticipantRow[] {
  return db.all<ParticipantRow>(
    'SELECT * FROM participants WHERE trip_id = ? AND deleted_at IS NULL AND merged_into IS NULL',
    [tripId],
  );
}

function requireParticipants(
  db: Database,
  tripId: string,
  ids: readonly string[],
): CommandError | undefined {
  const known = new Set(participantsOf(db, tripId).map((p) => p.id));
  for (const id of ids) {
    if (!known.has(id)) return { code: 'participant_not_found', participantId: id };
  }
  return undefined;
}

interface OpDraft {
  readonly tripId: string;
  readonly entity: OpEntity;
  readonly entityId: string;
  readonly kind: 'upsert' | 'delete';
  readonly payload: unknown;
}

function record(db: Database, ctx: CommandContext, draft: OpDraft): void {
  enqueue(db, {
    id: ctx.newId(),
    tripId: draft.tripId,
    entity: draft.entity,
    entityId: draft.entityId,
    kind: draft.kind,
    payload: draft.payload,
    createdAt: ctx.now(),
  });
}

// Mesma fronteira não verificada do driver: o chamador afirma o formato da linha.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function rowOf<T>(db: Database, table: string, id: string): T | undefined {
  return db.get<T>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

// ---------------------------------------------------------------------------
// Viagem e participantes
// ---------------------------------------------------------------------------

export interface CreateTripInput {
  readonly name: string;
  readonly baseCurrency: string;
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly coverColor?: string;
}

export function createTrip(db: Database, ctx: CommandContext, input: CreateTripInput): string {
  const id = ctx.newId();
  const now = ctx.now();

  db.transaction(() => {
    db.run(
      `INSERT INTO trips (id, name, base_currency, starts_on, ends_on, cover_color, actor_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, (SELECT actor_id FROM device_state WHERE id = 1), ?)`,
      [
        id,
        input.name,
        input.baseCurrency,
        input.startsOn ?? null,
        input.endsOn ?? null,
        input.coverColor ?? '#6D4AFF',
        now,
      ],
    );
    record(db, ctx, {
      tripId: id,
      entity: 'trip',
      entityId: id,
      kind: 'upsert',
      payload: rowOf(db, 'trips', id),
    });
  });

  return id;
}

/**
 * Encerra a viagem: ela sai da lista de ativas e vai para as encerradas.
 *
 * É arquivar, não apagar — o histórico continua consultável, e `unarchiveTrip`
 * traz de volta se alguém lembrar de uma despesa esquecida.
 */
export function archiveTrip(
  db: Database,
  ctx: CommandContext,
  tripId: string,
  archived = true,
): Result<void, CommandError> {
  if (getTrip(db, tripId) === undefined) return err({ code: 'trip_not_found' });

  db.transaction(() => {
    db.run(
      'UPDATE trips SET archived_at = ?, lamport = lamport + 1, updated_at = ? WHERE id = ?',
      [archived ? ctx.now() : null, ctx.now(), tripId],
    );
    record(db, ctx, {
      tripId,
      entity: 'trip',
      entityId: tripId,
      kind: 'upsert',
      payload: rowOf(db, 'trips', tripId),
    });
  });

  return ok(undefined);
}

/**
 * Define quais moedas a viagem usa (§ escolhido na abertura).
 *
 * A moeda-base entra sempre, mesmo que não venha na lista: o acerto acontece
 * nela por padrão.
 */
export function setTripCurrencies(
  db: Database,
  ctx: CommandContext,
  tripId: string,
  codes: readonly string[],
): Result<void, CommandError> {
  const trip = getTrip(db, tripId);
  if (trip === undefined) return err({ code: 'trip_not_found' });

  const unique = [trip.base_currency, ...codes.filter((code) => code !== trip.base_currency)];

  db.transaction(() => {
    db.run('DELETE FROM trip_currencies WHERE trip_id = ?', [tripId]);
    unique.forEach((code, position) => {
      db.run('INSERT INTO trip_currencies (trip_id, code, position) VALUES (?, ?, ?)', [
        tripId,
        code,
        position,
      ]);
    });
    record(db, ctx, {
      tripId,
      entity: 'trip',
      entityId: tripId,
      kind: 'upsert',
      payload: { id: tripId, currencies: unique },
    });
  });

  return ok(undefined);
}

/** Acrescenta uma moeda à viagem sem mexer nas que já estão lá. */
export function addTripCurrency(
  db: Database,
  ctx: CommandContext,
  tripId: string,
  code: string,
): Result<void, CommandError> {
  const current = db
    .all<{ code: string }>('SELECT code FROM trip_currencies WHERE trip_id = ?', [tripId])
    .map((row) => row.code);
  if (current.includes(code)) return ok(undefined);
  return setTripCurrencies(db, ctx, tripId, [...current, code]);
}

export interface AddParticipantInput {
  readonly tripId: string;
  readonly displayName: string;
  readonly userId?: string;
  readonly email?: string;
}

export function addParticipant(
  db: Database,
  ctx: CommandContext,
  input: AddParticipantInput,
): Result<string, CommandError> {
  if (getTrip(db, input.tripId) === undefined) return err({ code: 'trip_not_found' });

  const id = ctx.newId();
  db.transaction(() => {
    db.run(
      `INSERT INTO participants (id, trip_id, display_name, user_id, avatar_seed, email, actor_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, (SELECT actor_id FROM device_state WHERE id = 1), ?)`,
      [id, input.tripId, input.displayName, input.userId ?? null, id, input.email ?? null, ctx.now()],
    );
    record(db, ctx, {
      tripId: input.tripId,
      entity: 'participant',
      entityId: id,
      kind: 'upsert',
      payload: rowOf(db, 'participants', id),
    });
  });

  return ok(id);
}

export interface UpdateParticipantInput {
  readonly participantId: string;
  readonly displayName?: string;
  readonly pixKey?: string | null;
  readonly pixKeyKind?: string | null;
  readonly pixName?: string | null;
  readonly pixCity?: string | null;
  readonly archived?: boolean;
}

export function updateParticipant(
  db: Database,
  ctx: CommandContext,
  input: UpdateParticipantInput,
): Result<void, CommandError> {
  const current = rowOf<ParticipantRow>(db, 'participants', input.participantId);
  if (current === undefined) {
    return err({ code: 'participant_not_found', participantId: input.participantId });
  }

  db.transaction(() => {
    db.run(
      `UPDATE participants
       SET display_name = ?, pix_key = ?, pix_key_kind = ?, pix_name = ?, pix_city = ?,
           archived_at = ?, lamport = lamport + 1, updated_at = ?
       WHERE id = ?`,
      [
        input.displayName ?? current.display_name,
        input.pixKey === undefined ? current.pix_key : input.pixKey,
        input.pixKeyKind === undefined ? current.pix_key_kind : input.pixKeyKind,
        input.pixName === undefined ? current.pix_name : input.pixName,
        input.pixCity === undefined ? current.pix_city : input.pixCity,
        input.archived === undefined ? current.archived_at : input.archived ? ctx.now() : null,
        ctx.now(),
        input.participantId,
      ],
    );
    record(db, ctx, {
      tripId: current.trip_id,
      entity: 'participant',
      entityId: input.participantId,
      kind: 'upsert',
      payload: rowOf(db, 'participants', input.participantId),
    });
  });

  return ok(undefined);
}

/**
 * Vincula um participante fantasma à conta de quem aceitou o convite (§7.2).
 *
 * É este passo que impede a segunda Ana: a pessoa herda as despesas já
 * lançadas em nome dela em vez de virar uma linha nova.
 */
export function linkParticipantToUser(
  db: Database,
  ctx: CommandContext,
  input: { participantId: string; userId: string },
): Result<void, CommandError> {
  const participant = rowOf<ParticipantRow>(db, 'participants', input.participantId);
  if (participant === undefined) {
    return err({ code: 'participant_not_found', participantId: input.participantId });
  }

  const taken = db.get<{ id: string }>(
    `SELECT id FROM participants
     WHERE trip_id = ? AND user_id = ? AND id <> ? AND deleted_at IS NULL AND merged_into IS NULL`,
    [participant.trip_id, input.userId, input.participantId],
  );
  if (taken !== undefined) return err({ code: 'user_already_linked', participantId: taken.id });

  db.transaction(() => {
    db.run(
      'UPDATE participants SET user_id = ?, lamport = lamport + 1, updated_at = ? WHERE id = ?',
      [input.userId, ctx.now(), input.participantId],
    );
    record(db, ctx, {
      tripId: participant.trip_id,
      entity: 'participant',
      entityId: input.participantId,
      kind: 'upsert',
      payload: rowOf(db, 'participants', input.participantId),
    });
  });

  return ok(undefined);
}

/**
 * Funde duas linhas que são a mesma pessoa (§7.2).
 *
 * Reatribui tudo do perdedor para o vencedor. Quando os dois aparecem na mesma
 * despesa, as partes são SOMADAS — nunca duplicadas nem descartadas — e um
 * acerto que viraria de alguém para si mesmo é encerrado, porque deixou de ser
 * uma dívida entre duas pessoas.
 *
 * `Σ saldos = 0` continua valendo depois disso, e há teste garantindo.
 */
export function mergeParticipants(
  db: Database,
  ctx: CommandContext,
  input: { loserId: string; winnerId: string },
): Result<void, CommandError> {
  if (input.loserId === input.winnerId) return err({ code: 'same_participant' });

  const loser = rowOf<ParticipantRow>(db, 'participants', input.loserId);
  if (loser === undefined) return err({ code: 'participant_not_found', participantId: input.loserId });
  const winner = rowOf<ParticipantRow>(db, 'participants', input.winnerId);
  if (winner === undefined) return err({ code: 'participant_not_found', participantId: input.winnerId });

  const tripId = loser.trip_id;

  db.transaction(() => {
    const touchedExpenses = db.all<{ id: string }>(
      `SELECT DISTINCT e.id FROM expenses e
       LEFT JOIN expense_shares s ON s.expense_id = e.id
       WHERE e.trip_id = ? AND (e.paid_by = ? OR s.participant_id = ?)`,
      [tripId, input.loserId, input.loserId],
    );

    // Partes na mesma despesa se somam.
    db.run(
      `UPDATE expense_shares
       SET computed_cents = computed_cents +
             COALESCE((SELECT l.computed_cents FROM expense_shares l
                       WHERE l.expense_id = expense_shares.expense_id AND l.participant_id = ?), 0),
           input_cents = input_cents +
             COALESCE((SELECT l.input_cents FROM expense_shares l
                       WHERE l.expense_id = expense_shares.expense_id AND l.participant_id = ?), 0)
       WHERE participant_id = ?`,
      [input.loserId, input.loserId, input.winnerId],
    );
    db.run(
      `DELETE FROM expense_shares
       WHERE participant_id = ?
         AND expense_id IN (SELECT expense_id FROM expense_shares WHERE participant_id = ?)`,
      [input.loserId, input.winnerId],
    );
    db.run('UPDATE expense_shares SET participant_id = ? WHERE participant_id = ?', [
      input.winnerId,
      input.loserId,
    ]);
    db.run('UPDATE expenses SET paid_by = ?, lamport = lamport + 1 WHERE paid_by = ? AND trip_id = ?', [
      input.winnerId,
      input.loserId,
      tripId,
    ]);

    // Acerto que ficaria de alguém para si mesmo deixa de fazer sentido.
    const selfSettlements = db.all<{ id: string }>(
      `SELECT id FROM settlements
       WHERE trip_id = ? AND deleted_at IS NULL
         AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))`,
      [tripId, input.loserId, input.winnerId, input.winnerId, input.loserId],
    );
    for (const settlement of selfSettlements) {
      db.run('UPDATE settlements SET deleted_at = ?, lamport = lamport + 1 WHERE id = ?', [
        ctx.now(),
        settlement.id,
      ]);
    }

    const touchedSettlements = db.all<{ id: string }>(
      'SELECT id FROM settlements WHERE trip_id = ? AND (from_id = ? OR to_id = ?)',
      [tripId, input.loserId, input.loserId],
    );
    // Os acertos entre as duas linhas já foram encerrados acima; reatribuí-los
    // aqui violaria o CHECK (from_id <> to_id), que é justamente o que impede
    // um pagamento de alguém para si mesmo sobreviver à mesclagem.
    db.run(
      'UPDATE settlements SET from_id = ?, lamport = lamport + 1 WHERE from_id = ? AND to_id <> ?',
      [input.winnerId, input.loserId, input.winnerId],
    );
    db.run(
      'UPDATE settlements SET to_id = ?, lamport = lamport + 1 WHERE to_id = ? AND from_id <> ?',
      [input.winnerId, input.loserId, input.winnerId],
    );

    db.run(
      'UPDATE participants SET merged_into = ?, deleted_at = ?, lamport = lamport + 1, updated_at = ? WHERE id = ?',
      [input.winnerId, ctx.now(), ctx.now(), input.loserId],
    );

    for (const expense of touchedExpenses) {
      record(db, ctx, {
        tripId,
        entity: 'expense',
        entityId: expense.id,
        kind: 'upsert',
        payload: { expense: rowOf(db, 'expenses', expense.id), shares: listShares(db, expense.id) },
      });
    }
    for (const settlement of touchedSettlements) {
      record(db, ctx, {
        tripId,
        entity: 'settlement',
        entityId: settlement.id,
        kind: 'upsert',
        payload: rowOf(db, 'settlements', settlement.id),
      });
    }
    record(db, ctx, {
      tripId,
      entity: 'participant',
      entityId: input.loserId,
      kind: 'upsert',
      payload: rowOf(db, 'participants', input.loserId),
    });
  });

  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Despesas
// ---------------------------------------------------------------------------

export interface ExpenseInput {
  readonly tripId: string;
  readonly description: string;
  readonly category?: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly fxRatePpm: number;
  readonly fxManual?: boolean;
  readonly fxAsOf?: string;
  readonly paymentMethod?: string;
  readonly iofPpm?: number;
  readonly spentOn: string;
  readonly paidBy: string;
  readonly split: Split;
  readonly note?: string;
}

function splitParticipantIds(split: Split): string[] {
  return split.type === 'equal'
    ? [...split.participantIds]
    : split.entries.map((entry) => entry.participantId);
}

function writeShares(db: Database, expenseId: string, split: Split, shares: readonly { participantId: string; cents: number }[]): void {
  db.run('DELETE FROM expense_shares WHERE expense_id = ?', [expenseId]);
  const inputByParticipant = new Map<string, number>(
    split.type === 'exact' ? split.entries.map((e) => [e.participantId, e.cents]) : [],
  );
  shares.forEach((share, position) => {
    db.run(
      `INSERT INTO expense_shares (expense_id, participant_id, input_cents, computed_cents, position)
       VALUES (?, ?, ?, ?, ?)`,
      [expenseId, share.participantId, inputByParticipant.get(share.participantId) ?? 0, share.cents, position],
    );
  });
}

/** Guarda a combinação usada, para virar chip na próxima despesa (§7.1). */
function rememberSubgroup(db: Database, ctx: CommandContext, tripId: string, ids: readonly string[]): void {
  const active = listActiveParticipants(db, tripId).map((p) => p.id);
  if (ids.length < 2 || ids.length >= active.length) return;

  const sorted = JSON.stringify([...ids].sort());
  const existing = db.get<{ id: string }>(
    'SELECT id FROM trip_subgroups WHERE trip_id = ? AND participant_ids = ?',
    [tripId, sorted],
  );

  if (existing === undefined) {
    db.run(
      'INSERT INTO trip_subgroups (id, trip_id, label, participant_ids, last_used_at) VALUES (?, ?, NULL, ?, ?)',
      [ctx.newId(), tripId, sorted, ctx.now()],
    );
  } else {
    db.run('UPDATE trip_subgroups SET last_used_at = ? WHERE id = ?', [ctx.now(), existing.id]);
  }
}

export function createExpense(
  db: Database,
  ctx: CommandContext,
  input: ExpenseInput,
): Result<string, CommandError> {
  if (getTrip(db, input.tripId) === undefined) return err({ code: 'trip_not_found' });

  const involved = [input.paidBy, ...splitParticipantIds(input.split)];
  const missing = requireParticipants(db, input.tripId, involved);
  if (missing !== undefined) return err(missing);

  const shares = computeShares(input.amountCents, input.split);
  if (!shares.ok) return err({ code: 'split', error: shares.error });

  const id = ctx.newId();
  db.transaction(() => {
    db.run(
      `INSERT INTO expenses (id, trip_id, description, category, amount_cents, currency, fx_rate_ppm,
                             fx_manual, fx_as_of, payment_method, iof_ppm, spent_on, paid_by, split_type,
                             note, created_by, actor_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               (SELECT actor_id FROM device_state WHERE id = 1),
               (SELECT actor_id FROM device_state WHERE id = 1), ?)`,
      [
        id,
        input.tripId,
        input.description,
        input.category ?? 'other',
        input.amountCents,
        input.currency,
        input.fxRatePpm,
        input.fxManual === true ? 1 : 0,
        input.fxAsOf ?? null,
        input.paymentMethod ?? 'no_fx',
        input.iofPpm ?? 0,
        input.spentOn,
        input.paidBy,
        input.split.type,
        input.note ?? null,
        ctx.now(),
      ],
    );
    writeShares(db, id, input.split, shares.value);
    rememberSubgroup(db, ctx, input.tripId, splitParticipantIds(input.split));

    record(db, ctx, {
      tripId: input.tripId,
      entity: 'expense',
      entityId: id,
      kind: 'upsert',
      payload: { expense: rowOf(db, 'expenses', id), shares: listShares(db, id) },
    });
  });

  return ok(id);
}

export function updateExpense(
  db: Database,
  ctx: CommandContext,
  expenseId: string,
  input: ExpenseInput,
): Result<void, CommandError> {
  const current = db.get<{ id: string }>('SELECT id FROM expenses WHERE id = ? AND deleted_at IS NULL', [
    expenseId,
  ]);
  if (current === undefined) return err({ code: 'expense_not_found' });

  const missing = requireParticipants(db, input.tripId, [
    input.paidBy,
    ...splitParticipantIds(input.split),
  ]);
  if (missing !== undefined) return err(missing);

  const shares = computeShares(input.amountCents, input.split);
  if (!shares.ok) return err({ code: 'split', error: shares.error });

  db.transaction(() => {
    db.run(
      `UPDATE expenses
       SET description = ?, category = ?, amount_cents = ?, currency = ?, fx_rate_ppm = ?,
           fx_manual = ?, fx_as_of = ?, payment_method = ?, iof_ppm = ?, spent_on = ?, paid_by = ?,
           split_type = ?, note = ?, lamport = lamport + 1, updated_at = ?
       WHERE id = ?`,
      [
        input.description,
        input.category ?? 'other',
        input.amountCents,
        input.currency,
        input.fxRatePpm,
        input.fxManual === true ? 1 : 0,
        input.fxAsOf ?? null,
        input.paymentMethod ?? 'no_fx',
        input.iofPpm ?? 0,
        input.spentOn,
        input.paidBy,
        input.split.type,
        input.note ?? null,
        ctx.now(),
        expenseId,
      ],
    );
    // As partes são substituídas em bloco, nunca mescladas linha a linha (§10):
    // um merge parcial produziria uma despesa cujas partes não somam o total.
    writeShares(db, expenseId, input.split, shares.value);

    record(db, ctx, {
      tripId: input.tripId,
      entity: 'expense',
      entityId: expenseId,
      kind: 'upsert',
      payload: { expense: rowOf(db, 'expenses', expenseId), shares: listShares(db, expenseId) },
    });
  });

  return ok(undefined);
}

export function deleteExpense(
  db: Database,
  ctx: CommandContext,
  expenseId: string,
): Result<void, CommandError> {
  const current = db.get<{ trip_id: string }>(
    'SELECT trip_id FROM expenses WHERE id = ? AND deleted_at IS NULL',
    [expenseId],
  );
  if (current === undefined) return err({ code: 'expense_not_found' });

  db.transaction(() => {
    // Tombstone, nunca DELETE: o registro precisa poder voltar (undo) e a
    // exclusão precisa viajar para os outros aparelhos.
    db.run('UPDATE expenses SET deleted_at = ?, lamport = lamport + 1, updated_at = ? WHERE id = ?', [
      ctx.now(),
      ctx.now(),
      expenseId,
    ]);
    record(db, ctx, {
      tripId: current.trip_id,
      entity: 'expense',
      entityId: expenseId,
      kind: 'delete',
      payload: { id: expenseId, deletedAt: ctx.now() },
    });
  });

  return ok(undefined);
}

export function restoreExpense(
  db: Database,
  ctx: CommandContext,
  expenseId: string,
): Result<void, CommandError> {
  const current = db.get<{ trip_id: string }>('SELECT trip_id FROM expenses WHERE id = ?', [expenseId]);
  if (current === undefined) return err({ code: 'expense_not_found' });

  db.transaction(() => {
    db.run('UPDATE expenses SET deleted_at = NULL, lamport = lamport + 1, updated_at = ? WHERE id = ?', [
      ctx.now(),
      expenseId,
    ]);
    record(db, ctx, {
      tripId: current.trip_id,
      entity: 'expense',
      entityId: expenseId,
      kind: 'upsert',
      payload: { expense: rowOf(db, 'expenses', expenseId), shares: listShares(db, expenseId) },
    });
  });

  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Acertos
// ---------------------------------------------------------------------------

export interface SettlementInput {
  readonly tripId: string;
  readonly fromId: string;
  readonly toId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly fxRatePpm: number;
  readonly settledOn: string;
  readonly note?: string;
}

export function recordSettlement(
  db: Database,
  ctx: CommandContext,
  input: SettlementInput,
): Result<string, CommandError> {
  if (getTrip(db, input.tripId) === undefined) return err({ code: 'trip_not_found' });
  if (input.fromId === input.toId) return err({ code: 'same_participant' });

  const missing = requireParticipants(db, input.tripId, [input.fromId, input.toId]);
  if (missing !== undefined) return err(missing);

  const id = ctx.newId();
  db.transaction(() => {
    db.run(
      `INSERT INTO settlements (id, trip_id, from_id, to_id, amount_cents, currency, fx_rate_ppm,
                                settled_on, note, actor_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT actor_id FROM device_state WHERE id = 1), ?)`,
      [
        id,
        input.tripId,
        input.fromId,
        input.toId,
        input.amountCents,
        input.currency,
        input.fxRatePpm,
        input.settledOn,
        input.note ?? null,
        ctx.now(),
      ],
    );
    record(db, ctx, {
      tripId: input.tripId,
      entity: 'settlement',
      entityId: id,
      kind: 'upsert',
      payload: rowOf(db, 'settlements', id),
    });
  });

  return ok(id);
}

export function deleteSettlement(
  db: Database,
  ctx: CommandContext,
  settlementId: string,
): Result<void, CommandError> {
  const current = db.get<{ trip_id: string }>(
    'SELECT trip_id FROM settlements WHERE id = ? AND deleted_at IS NULL',
    [settlementId],
  );
  if (current === undefined) return err({ code: 'settlement_not_found' });

  db.transaction(() => {
    db.run('UPDATE settlements SET deleted_at = ?, lamport = lamport + 1, updated_at = ? WHERE id = ?', [
      ctx.now(),
      ctx.now(),
      settlementId,
    ]);
    record(db, ctx, {
      tripId: current.trip_id,
      entity: 'settlement',
      entityId: settlementId,
      kind: 'delete',
      payload: { id: settlementId, deletedAt: ctx.now() },
    });
  });

  return ok(undefined);
}
