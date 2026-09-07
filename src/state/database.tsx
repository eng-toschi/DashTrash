/**
 * Acesso ao banco a partir da UI (spec §4).
 *
 * Leitura é síncrona, direto do SQLite, durante o render: as consultas são
 * locais e pequenas, e é isso que permite não existir estado de carregamento em
 * tela nenhuma. Escrita passa por `mutate`, que roda o comando e incrementa uma
 * revisão — as telas relêem porque a revisão mudou, nunca porque a função
 * devolveu alguma coisa.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CommandContext } from '@/commands';
import type { Database } from '@/db/driver';
import { openExpoSqlite } from '@/db/drivers/expoSqlite';
import { uuidV7 } from '@/db/ids';
import { initialize } from '@/db/migrate';

interface DatabaseStore {
  readonly db: Database;
  readonly ctx: CommandContext;
  readonly revision: number;
  readonly mutate: <T>(action: (db: Database, ctx: CommandContext) => T) => T;
}

const DatabaseContext = createContext<DatabaseStore | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);

  const db = useMemo(() => {
    // O id do aparelho é gravado uma vez e ignorado nas aberturas seguintes:
    // ele é o desempate do Lamport, então não pode mudar entre sessões (§10).
    return initialize(openExpoSqlite(), uuidV7());
  }, []);

  const ctx = useMemo<CommandContext>(
    () => ({ newId: () => uuidV7(), now: () => new Date().toISOString() }),
    [],
  );

  const mutate = useCallback(
    <T,>(action: (database: Database, context: CommandContext) => T): T => {
      const result = action(db, ctx);
      setRevision((current) => current + 1);
      return result;
    },
    [db, ctx],
  );

  const value = useMemo<DatabaseStore>(() => ({ db, ctx, revision, mutate }), [db, ctx, revision, mutate]);

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): DatabaseStore {
  const store = useContext(DatabaseContext);
  if (store === undefined) throw new Error('useDatabase fora do DatabaseProvider.');
  return store;
}

/** Lê do banco e reavalia sempre que alguma escrita acontece. */
export function useQuery<T>(read: (db: Database) => T): T {
  const { db, revision } = useDatabase();
  return useMemo(() => read(db), [db, revision, read]);
}

export function useMutate(): DatabaseStore['mutate'] {
  return useDatabase().mutate;
}
