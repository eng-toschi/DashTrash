/**
 * Driver para `better-sqlite3` — usado nos testes e em qualquer script Node.
 * O app usa `expo-sqlite`, com um adaptador irmão deste (Fase 3).
 */
import DatabaseConstructor from 'better-sqlite3';
import { withTransactions, type Database, type SqlParams } from '../driver';

export function openBetterSqlite(filename = ':memory:'): Database {
  const handle = new DatabaseConstructor(filename);
  handle.pragma('foreign_keys = ON');
  handle.pragma('journal_mode = WAL');

  const params = (values?: SqlParams): unknown[] => (values === undefined ? [] : [...values]);

  return withTransactions({
    exec: (sql) => { handle.exec(sql); },
    run: (sql, values) => { handle.prepare(sql).run(...params(values)); },
    all: <T,>(sql: string, values?: SqlParams): T[] => handle.prepare(sql).all(...params(values)) as T[],
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    get: <T,>(sql: string, values?: SqlParams): T | undefined =>
      handle.prepare(sql).get(...params(values)) as T | undefined,
    close: () => { handle.close(); },
  });
}
