/**
 * Leitura: transforma linhas do SQLite nos tipos puros de `domain/`.
 *
 * Nenhum cálculo mora aqui. O repositório monta o `TripLedger` e entrega para
 * o domínio decidir saldos e fechamento — é o que mantém a matemática testável
 * sem banco nenhum.
 */
import type { TripExpense, TripLedger, TripSettlement } from '../domain/balance.js';
import type { Share } from '../domain/split.js';
import type { Database } from './driver.js';

export interface TripRow {
  id: string;
  name: string;
  base_currency: string;
  starts_on: string | null;
  ends_on: string | null;
  cover_color: string;
  archived_at: string | null;
}

export interface ParticipantRow {
  id: string;
  trip_id: string;
  display_name: string;
  user_id: string | null;
  avatar_seed: string;
  email: string | null;
  pix_key: string | null;
  pix_key_kind: string | null;
  pix_name: string | null;
  pix_city: string | null;
  merged_into: string | null;
  archived_at: string | null;
}

export interface ExpenseRow {
  id: string;
  trip_id: string;
  description: string;
  category: string;
  amount_cents: number;
  currency: string;
  fx_rate_ppm: number;
  fx_manual: number;
  fx_as_of: string | null;
  payment_method: string;
  iof_ppm: number;
  spent_on: string;
  paid_by: string;
  split_type: 'equal' | 'exact';
  note: string | null;
}

interface ShareRow {
  expense_id: string;
  participant_id: string;
  input_cents: number;
  computed_cents: number;
}

interface SettlementRow {
  id: string;
  trip_id: string;
  from_id: string;
  to_id: string;
  amount_cents: number;
  currency: string;
  fx_rate_ppm: number;
  settled_on: string;
  note: string | null;
}

export function getTrip(db: Database, tripId: string): TripRow | undefined {
  return db.get<TripRow>('SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL', [tripId]);
}

export function listTrips(db: Database): TripRow[] {
  return db.all<TripRow>(
    'SELECT * FROM trips WHERE deleted_at IS NULL ORDER BY archived_at IS NOT NULL, starts_on DESC, name ASC',
  );
}

/** Participantes vivos. Quem foi mesclado some daqui, mas segue no histórico. */
export function listParticipants(db: Database, tripId: string): ParticipantRow[] {
  return db.all<ParticipantRow>(
    `SELECT * FROM participants
     WHERE trip_id = ? AND deleted_at IS NULL AND merged_into IS NULL
     ORDER BY display_name COLLATE NOCASE ASC`,
    [tripId],
  );
}

/** Só quem pode entrar em novas divisões (arquivado sai; histórico permanece). */
export function listActiveParticipants(db: Database, tripId: string): ParticipantRow[] {
  return listParticipants(db, tripId).filter((p) => p.archived_at === null);
}

export function listExpenses(db: Database, tripId: string): ExpenseRow[] {
  return db.all<ExpenseRow>(
    'SELECT * FROM expenses WHERE trip_id = ? AND deleted_at IS NULL ORDER BY spent_on DESC, id DESC',
    [tripId],
  );
}

export function listShares(db: Database, expenseId: string): Share[] {
  return db
    .all<ShareRow>(
      'SELECT * FROM expense_shares WHERE expense_id = ? ORDER BY position ASC, participant_id ASC',
      [expenseId],
    )
    .map((row) => ({ participantId: row.participant_id, cents: row.computed_cents }));
}

export function listSettlements(db: Database, tripId: string): SettlementRow[] {
  return db.all<SettlementRow>(
    'SELECT * FROM settlements WHERE trip_id = ? AND deleted_at IS NULL ORDER BY settled_on ASC, id ASC',
    [tripId],
  );
}

/**
 * Monta o razão completo da viagem, pronto para `computeBalances` e o fechamento.
 *
 * Inclui participantes arquivados: eles saem das novas divisões, mas continuam
 * nas antigas e no saldo — tirá-los daqui quebraria `Σ saldos = 0`.
 */
export function loadLedger(db: Database, tripId: string): TripLedger {
  const trip = getTrip(db, tripId);
  if (trip === undefined) throw new Error(`Viagem não encontrada: ${tripId}`);

  const participantIds = listParticipants(db, tripId).map((p) => p.id);

  const expenses: TripExpense[] = listExpenses(db, tripId).map((row) => ({
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    fxRatePpm: row.fx_rate_ppm,
    iofPpm: row.iof_ppm,
    paidBy: row.paid_by,
    shares: listShares(db, row.id),
  }));

  const settlements: TripSettlement[] = listSettlements(db, tripId).map((row) => ({
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    fxRatePpm: row.fx_rate_ppm,
  }));

  return { baseCurrency: trip.base_currency, participantIds, expenses, settlements };
}

export interface SubgroupRow {
  id: string;
  trip_id: string;
  label: string | null;
  participant_ids: string;
  last_used_at: string;
}

/** Subgrupos salvos, mais recentes primeiro — os chips do seletor (§7.1). */
export function listSubgroups(db: Database, tripId: string, limit = 3): { id: string; label: string | null; participantIds: string[] }[] {
  return db
    .all<SubgroupRow>(
      'SELECT * FROM trip_subgroups WHERE trip_id = ? ORDER BY last_used_at DESC LIMIT ?',
      [tripId, limit],
    )
    .map((row) => ({
      id: row.id,
      label: row.label,
      participantIds: JSON.parse(row.participant_ids) as string[],
    }));
}
