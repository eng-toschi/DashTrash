/**
 * Executor de migrações.
 *
 * Usa `PRAGMA user_version`, que é o contador que o próprio SQLite guarda no
 * cabeçalho do arquivo — não precisa de tabela de controle e não some se alguém
 * apagar dados.
 */
import type { Database } from './driver';
import { LATEST_VERSION, MIGRATIONS, type Migration } from './migrations';

export function currentVersion(db: Database): number {
  const row = db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly string[];
}

export function migrate(db: Database, target = LATEST_VERSION): MigrationResult {
  const from = currentVersion(db);
  if (from > target) {
    throw new Error(
      `Banco na versão ${String(from)}, mais nova que a suportada (${String(target)}). ` +
        'Provavelmente o app foi rebaixado — atualize em vez de migrar para trás.',
    );
  }

  const pending: Migration[] = MIGRATIONS.filter((m) => m.version > from && m.version <= target).sort(
    (a, b) => a.version - b.version,
  );

  const applied: string[] = [];
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      // user_version não aceita parâmetro ligado; a versão vem da constante do código.
      db.exec(`PRAGMA user_version = ${String(migration.version)}`);
    });
    applied.push(`${String(migration.version)}_${migration.name}`);
  }

  return { from, to: currentVersion(db), applied };
}

/** Abre um banco pronto para uso: migrado e com a identidade do aparelho gravada. */
export function initialize(db: Database, actorId: string): Database {
  migrate(db);
  db.run('INSERT OR IGNORE INTO device_state (id, actor_id, lamport, op_seq) VALUES (1, ?, 0, 0)', [
    actorId,
  ]);
  return db;
}
