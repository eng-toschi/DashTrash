/**
 * Relógio de Lamport do aparelho (spec §10).
 *
 * Não se usa o relógio do celular para ordenar operações: o aparelho do amigo
 * pode estar com a data errada, e no exterior o fuso muda no meio da viagem.
 * O contador é persistido junto com o estado, na mesma transação da operação.
 */
import type { Database } from '../db/driver.js';

export interface DeviceState {
  readonly actorId: string;
  readonly lamport: number;
  readonly opSeq: number;
}

interface DeviceRow {
  actor_id: string;
  lamport: number;
  op_seq: number;
}

export function readDeviceState(db: Database): DeviceState {
  const row = db.get<DeviceRow>('SELECT actor_id, lamport, op_seq FROM device_state WHERE id = 1');
  if (row === undefined) throw new Error('Banco não inicializado: falta o estado do aparelho.');
  return { actorId: row.actor_id, lamport: row.lamport, opSeq: row.op_seq };
}

/** Avança o relógio e devolve o novo valor. Deve ser chamado dentro da transação. */
export function tick(db: Database): { lamport: number; seq: number; actorId: string } {
  const state = readDeviceState(db);
  const lamport = state.lamport + 1;
  const seq = state.opSeq + 1;
  db.run('UPDATE device_state SET lamport = ?, op_seq = ? WHERE id = 1', [lamport, seq]);
  return { lamport, seq, actorId: state.actorId };
}

/**
 * Absorve o relógio de uma operação recebida: `max(local, recebido) + 1`.
 * É o que faz dois aparelhos convergirem sem combinarem nada.
 */
export function observe(db: Database, remoteLamport: number): number {
  const state = readDeviceState(db);
  const lamport = Math.max(state.lamport, remoteLamport) + 1;
  db.run('UPDATE device_state SET lamport = ? WHERE id = 1', [lamport]);
  return lamport;
}
