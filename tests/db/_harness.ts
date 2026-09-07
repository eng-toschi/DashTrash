/** Banco em memória e contexto determinístico para os testes da camada de dados. */
import { openBetterSqlite } from '@/db/drivers/betterSqlite.js';
import { initialize, migrate } from '@/db/migrate.js';
import type { Database } from '@/db/driver.js';
import type { CommandContext } from '@/commands/index.js';

export function openTestDb(actorId = 'aparelho-a'): Database {
  return initialize(openBetterSqlite(), actorId);
}

export function openTestDbAtVersion(version: number, actorId = 'aparelho-a'): Database {
  const db = openBetterSqlite();
  migrate(db, version);
  db.run('INSERT OR IGNORE INTO device_state (id, actor_id) VALUES (1, ?)', [actorId]);
  return db;
}

/**
 * Ids sequenciais e relógio fixo: os testes precisam ser reprodutíveis, e o
 * desempate de centavos do `allocate` é lexicográfico por id.
 */
export function makeContext(prefix = 'id'): CommandContext {
  let counter = 0;
  return {
    newId: () => {
      counter += 1;
      return `${prefix}-${String(counter).padStart(4, '0')}`;
    },
    now: () => '2026-03-14T12:00:00.000Z',
  };
}
