/**
 * Driver para `expo-sqlite` — o do aparelho.
 *
 * Usa a API síncrona: as consultas deste app são pequenas e locais, e ler
 * direto no render é o que dispensa estado de carregamento em tela nenhuma.
 * A rede não participa da leitura (§4).
 */
import * as SQLite from 'expo-sqlite';
import { withTransactions, type Database, type SqlParams } from '../driver';

export function openExpoSqlite(name = 'rachei.db'): Database {
  const handle = SQLite.openDatabaseSync(name);
  handle.execSync('PRAGMA foreign_keys = ON');

  const args = (values?: SqlParams): SQLite.SQLiteBindValue[] =>
    values === undefined ? [] : ([...values] as SQLite.SQLiteBindValue[]);

  return withTransactions({
    exec: (sql) => { handle.execSync(sql); },
    run: (sql, values) => { handle.runSync(sql, args(values)); },
    all: <T,>(sql: string, values?: SqlParams): T[] => handle.getAllSync<T>(sql, args(values)),
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    get: <T,>(sql: string, values?: SqlParams): T | undefined =>
      handle.getFirstSync<T>(sql, args(values)) ?? undefined,
    close: () => { handle.closeSync(); },
  });
}
