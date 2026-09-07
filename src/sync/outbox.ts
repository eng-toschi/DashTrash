/**
 * Outbox de operações (spec §4 e §10).
 *
 * A regra que sustenta o offline: estado e operação são gravados na MESMA
 * transação. Ou os dois entram, ou nenhum entra. Sem isso o app mostraria uma
 * despesa que nunca chega aos outros, ou enviaria uma que não existe aqui.
 *
 * O outbox mora no SQLite, não em memória: matar o app no meio do envio não
 * perde nem duplica operação.
 */
import type { Database } from '../db/driver';
import { tick } from './clock';

export type OpEntity = 'trip' | 'participant' | 'expense' | 'settlement' | 'subgroup';
export type OpKind = 'upsert' | 'delete';

export interface Op {
  readonly id: string;
  readonly tripId: string;
  readonly entity: OpEntity;
  readonly entityId: string;
  readonly kind: OpKind;
  readonly payload: unknown;
  readonly lamport: number;
  readonly actorId: string;
  readonly createdAt: string;
  readonly seq: number;
  readonly attempts: number;
  readonly lastError: string | null;
}

export interface EnqueueInput {
  readonly id: string;
  readonly tripId: string;
  readonly entity: OpEntity;
  readonly entityId: string;
  readonly kind: OpKind;
  readonly payload: unknown;
  readonly createdAt: string;
}

interface OpRow {
  id: string;
  trip_id: string;
  entity: OpEntity;
  entity_id: string;
  kind: OpKind;
  payload: string;
  lamport: number;
  actor_id: string;
  created_at: string;
  seq: number;
  attempts: number;
  last_error: string | null;
}

function toOp(row: OpRow): Op {
  return {
    id: row.id,
    tripId: row.trip_id,
    entity: row.entity,
    entityId: row.entity_id,
    kind: row.kind,
    payload: JSON.parse(row.payload) as unknown,
    lamport: row.lamport,
    actorId: row.actor_id,
    createdAt: row.created_at,
    seq: row.seq,
    attempts: row.attempts,
    lastError: row.last_error,
  };
}

/**
 * Grava a operação e avança o relógio. Deve ser chamada DENTRO da transação
 * que altera o estado — é essa co-localização que dá a atomicidade.
 */
export function enqueue(db: Database, input: EnqueueInput): Op {
  const { lamport, seq, actorId } = tick(db);
  db.run(
    `INSERT INTO ops_outbox (id, trip_id, entity, entity_id, kind, payload, lamport, actor_id, created_at, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.tripId,
      input.entity,
      input.entityId,
      input.kind,
      JSON.stringify(input.payload),
      lamport,
      actorId,
      input.createdAt,
      seq,
    ],
  );

  return {
    id: input.id,
    tripId: input.tripId,
    entity: input.entity,
    entityId: input.entityId,
    kind: input.kind,
    payload: input.payload,
    lamport,
    actorId,
    createdAt: input.createdAt,
    seq,
    attempts: 0,
    lastError: null,
  };
}

/** Operações à espera de envio, na ordem em que aconteceram. */
export function pendingOps(db: Database, limit = 100): Op[] {
  return db
    .all<OpRow>('SELECT * FROM ops_outbox ORDER BY seq ASC LIMIT ?', [limit])
    .map(toOp);
}

export function pendingCount(db: Database): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ops_outbox')?.n ?? 0;
}

/** Confirma o envio. Idempotente: reenviar a mesma operação não duplica nada. */
export function markSynced(db: Database, opIds: readonly string[]): void {
  if (opIds.length === 0) return;
  const holes = opIds.map(() => '?').join(', ');
  db.run(`DELETE FROM ops_outbox WHERE id IN (${holes})`, [...opIds]);
}

export function markFailed(db: Database, opId: string, error: string): void {
  db.run('UPDATE ops_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?', [error, opId]);
}
