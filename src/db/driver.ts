/**
 * Porta de acesso ao SQLite.
 *
 * O app roda em `expo-sqlite` e os testes em `better-sqlite3`. Os dois expõem a
 * mesma forma síncrona (preparar, executar, ler), então uma interface de meia
 * dúzia de métodos é suficiente — e evita que a camada de dados fique presa a
 * uma versão de driver nativo, que é uma das coisas que mais quebram num
 * projeto React Native.
 *
 * Transação é feita com SAVEPOINT em vez de BEGIN/COMMIT: comandos podem se
 * compor (mesclar participante mexe em despesas), e savepoint aninha.
 */
export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface SqlDriver {
  /** Executa SQL sem parâmetros. Aceita múltiplas instruções. */
  exec(sql: string): void;
  run(sql: string, params?: SqlParams): void;
  all<T>(sql: string, params?: SqlParams): T[];
  /**
   * O tipo é uma AFIRMAÇÃO sobre o formato da linha, não uma verificação:
   * o SQLite devolve `unknown` e ninguém confere. Manter as consultas junto
   * dos tipos de linha em `repositories.ts` é o que segura essa fronteira.
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  get<T>(sql: string, params?: SqlParams): T | undefined;
  close(): void;
}

export interface Database extends SqlDriver {
  /** Roda `fn` numa transação. Qualquer exceção desfaz tudo. */
  transaction<T>(fn: () => T): T;
}

/** Envolve um driver cru com transações aninháveis. */
export function withTransactions(driver: SqlDriver): Database {
  let depth = 0;

  return {
    exec: (sql) => { driver.exec(sql); },
    run: (sql, params) => { driver.run(sql, params); },
    all: (sql, params) => driver.all(sql, params),
    get: (sql, params) => driver.get(sql, params),
    close: () => { driver.close(); },

    transaction<T>(fn: () => T): T {
      const name = `sp_${String(depth)}`;
      depth += 1;
      driver.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        driver.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        driver.exec(`ROLLBACK TO ${name}`);
        driver.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };
}
