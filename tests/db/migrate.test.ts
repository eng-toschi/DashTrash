import { describe, expect, it } from 'vitest';
import { openBetterSqlite } from '@/db/drivers/betterSqlite';
import { currentVersion, migrate } from '@/db/migrate';
import { LATEST_VERSION } from '@/db/migrations';
import { computeBalances, listTripCurrencies, loadLedger } from '@/index';
import { sumCents } from '@/domain/money';
import { openTestDbAtVersion } from './_harness';

describe('migrações', () => {
  it('leva um banco vazio até a versão mais recente', () => {
    const db = openBetterSqlite();
    const result = migrate(db);

    expect(result.from).toBe(0);
    expect(result.to).toBe(LATEST_VERSION);
    expect(result.applied).toEqual(['1_initial', '2_pix_iof_subgroups', '3_trip_currencies']);
  });

  it('rodar de novo não faz nada', () => {
    const db = openBetterSqlite();
    migrate(db);
    expect(migrate(db).applied).toEqual([]);
    expect(currentVersion(db)).toBe(LATEST_VERSION);
  });

  it('recusa banco mais novo que o app, em vez de migrar para trás', () => {
    const db = openBetterSqlite();
    migrate(db);
    expect(() => migrate(db, 1)).toThrow(/mais nova que a suportada/u);
  });

  it('MIGRA UM BANCO POPULADO sem perder dado nem quebrar o saldo', () => {
    // O teste que o spec §12 exige: dados da versão anterior sobrevivem à
    // migração e os invariantes continuam valendo depois dela.
    const db = openTestDbAtVersion(1);

    db.run(
      `INSERT INTO trips (id, name, base_currency, cover_color, actor_id, updated_at)
       VALUES ('t1', 'Japão', 'BRL', '#6D4AFF', 'aparelho-a', '2026-03-01T00:00:00Z')`,
    );
    for (const [id, nome] of [
      ['p1', 'Ana'],
      ['p2', 'Bruno'],
    ] as const) {
      db.run(
        `INSERT INTO participants (id, trip_id, display_name, avatar_seed, actor_id, updated_at)
         VALUES (?, 't1', ?, ?, 'aparelho-a', '2026-03-01T00:00:00Z')`,
        [id, nome, id],
      );
    }
    db.run(
      `INSERT INTO expenses (id, trip_id, description, amount_cents, currency, fx_rate_ppm,
                             spent_on, paid_by, split_type, created_by, actor_id, updated_at)
       VALUES ('e1', 't1', 'Hotel', 20000, 'BRL', 1000000, '2026-03-02', 'p1', 'equal',
               'aparelho-a', 'aparelho-a', '2026-03-02T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO expense_shares (expense_id, participant_id, computed_cents)
       VALUES ('e1', 'p1', 10000), ('e1', 'p2', 10000)`,
    );

    const resultado = migrate(db);
    expect(resultado.from).toBe(1);
    expect(resultado.to).toBe(LATEST_VERSION);

    const ledger = loadLedger(db, 't1');
    expect(ledger.expenses).toHaveLength(1);
    expect(ledger.expenses[0]?.iofPpm).toBe(0);

    const saldos = computeBalances(ledger);
    expect(saldos.residualCents).toBe(0);
    expect(sumCents(saldos.balances.map((b) => b.cents))).toBe(0);
    expect(saldos.balances).toEqual([
      { participantId: 'p1', cents: 10_000 },
      { participantId: 'p2', cents: -10_000 },
    ]);
  });

  it('a versão 3 herda as moedas de uma viagem que já existia', () => {
    // Quem já tinha viagem não pode terminar sem moeda nenhuma no seletor.
    const db = openTestDbAtVersion(1);
    db.run(
      `INSERT INTO trips (id, name, base_currency, cover_color, actor_id, updated_at)
       VALUES ('t1', 'Japão', 'BRL', '#6D4AFF', 'aparelho-a', '2026-03-01T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO participants (id, trip_id, display_name, avatar_seed, actor_id, updated_at)
       VALUES ('p1', 't1', 'Ana', 'p1', 'aparelho-a', '2026-03-01T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO expenses (id, trip_id, description, amount_cents, currency, fx_rate_ppm,
                             spent_on, paid_by, split_type, created_by, actor_id, updated_at)
       VALUES ('e1', 't1', 'Hotel', 96000, 'JPY', 37000, '2026-03-02', 'p1', 'equal',
               'aparelho-a', 'aparelho-a', '2026-03-02T00:00:00Z')`,
    );

    migrate(db);

    expect(listTripCurrencies(db, 't1')).toEqual(['BRL', 'JPY']);
  });

  it('a versão 2 traz as colunas de Pix, IOF e a tabela de subgrupos', () => {
    const db = openTestDbAtVersion(2);
    const colunas = (tabela: string): string[] =>
      db.all<{ name: string }>(`PRAGMA table_info(${tabela})`).map((c) => c.name);

    expect(colunas('participants')).toEqual(expect.arrayContaining(['pix_key', 'pix_key_kind', 'merged_into']));
    expect(colunas('expenses')).toEqual(expect.arrayContaining(['iof_ppm', 'payment_method', 'fx_as_of']));
    expect(colunas('trip_subgroups')).toEqual(expect.arrayContaining(['participant_ids', 'last_used_at']));
  });
});
