/**
 * Driver para `expo-sqlite` — o do aparelho.
 *
 * Usa a API síncrona: as consultas deste app são pequenas e locais, e ler
 * direto no render é o que dispensa estado de carregamento em tela nenhuma.
 * A rede não participa da leitura (§4).
 */
import * as SQLite from 'expo-sqlite';
import { withTransactions, type Database, type SqlParams } from '../driver';

// O nome do arquivo NÃO acompanha o rebatismo do app para RachaPila de propósito:
// é só um detalhe de armazenamento, invisível ao usuário, e trocá-lo abriria um
// banco novo e vazio no próximo lançamento — apagando, na prática, toda viagem já
// testada no aparelho.
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
