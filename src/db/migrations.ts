/**
 * Migrações numeradas (spec §12).
 *
 * Regras: uma migração nunca é editada depois de existir — corrige-se com a
 * próxima. Todas rodam em transação e a versão só avança se a migração inteira
 * passar. É SQL puro de propósito: o mesmo texto roda no `expo-sqlite` do
 * aparelho e no `better-sqlite3` dos testes, sem tradutor no meio.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const INITIAL = `
CREATE TABLE trips (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  starts_on     TEXT,
  ends_on       TEXT,
  cover_color   TEXT NOT NULL DEFAULT '#6D4AFF',
  archived_at   TEXT,
  deleted_at    TEXT,
  lamport       INTEGER NOT NULL DEFAULT 0,
  actor_id      TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE participants (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id),
  display_name TEXT NOT NULL,
  user_id      TEXT,
  avatar_seed  TEXT NOT NULL,
  email        TEXT,
  archived_at  TEXT,
  deleted_at   TEXT,
  lamport      INTEGER NOT NULL DEFAULT 0,
  actor_id     TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE expenses (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id),
  description  TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency     TEXT NOT NULL,
  fx_rate_ppm  INTEGER NOT NULL,
  fx_manual    INTEGER NOT NULL DEFAULT 0,
  spent_on     TEXT NOT NULL,
  paid_by      TEXT NOT NULL REFERENCES participants(id),
  split_type   TEXT NOT NULL CHECK (split_type IN ('equal','exact')),
  note         TEXT,
  created_by   TEXT NOT NULL,
  deleted_at   TEXT,
  lamport      INTEGER NOT NULL DEFAULT 0,
  actor_id     TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE expense_shares (
  expense_id     TEXT NOT NULL REFERENCES expenses(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  input_cents    INTEGER NOT NULL DEFAULT 0,
  computed_cents INTEGER NOT NULL,
  position       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (expense_id, participant_id)
);

CREATE TABLE settlements (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id),
  from_id      TEXT NOT NULL REFERENCES participants(id),
  to_id        TEXT NOT NULL REFERENCES participants(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency     TEXT NOT NULL,
  fx_rate_ppm  INTEGER NOT NULL,
  settled_on   TEXT NOT NULL,
  note         TEXT,
  deleted_at   TEXT,
  lamport      INTEGER NOT NULL DEFAULT 0,
  actor_id     TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (from_id <> to_id)
);

CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  expense_id  TEXT NOT NULL REFERENCES expenses(id),
  local_uri   TEXT NOT NULL,
  remote_url  TEXT,
  bytes       INTEGER,
  uploaded_at TEXT
);

CREATE TABLE fx_rates (
  base     TEXT NOT NULL,
  quote    TEXT NOT NULL,
  as_of    TEXT NOT NULL,
  rate_ppm INTEGER NOT NULL,
  PRIMARY KEY (base, quote, as_of)
);

CREATE TABLE ops_outbox (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('upsert','delete')),
  payload    TEXT NOT NULL,
  lamport    INTEGER NOT NULL,
  actor_id   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE sync_state (
  trip_id      TEXT PRIMARY KEY,
  cursor       TEXT,
  last_pull_at TEXT
);

-- Estado do aparelho: identidade do ator e o relógio de Lamport (§10).
CREATE TABLE device_state (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  actor_id TEXT NOT NULL,
  lamport  INTEGER NOT NULL DEFAULT 0,
  op_seq   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_expenses_trip_date ON expenses(trip_id, spent_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_shares_participant ON expense_shares(participant_id);
CREATE INDEX idx_settlements_trip   ON settlements(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_participants_trip  ON participants(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_outbox_seq         ON ops_outbox(seq);
`;

/**
 * Segunda migração: o que o spec ganhou depois do primeiro corte — chave Pix,
 * IOF, data da cotação, subgrupos salvos e a mesclagem de participante.
 */
const PIX_IOF_SUBGROUPS = `
ALTER TABLE participants ADD COLUMN pix_key TEXT;
ALTER TABLE participants ADD COLUMN pix_key_kind TEXT;
ALTER TABLE participants ADD COLUMN pix_name TEXT;
ALTER TABLE participants ADD COLUMN pix_city TEXT;
ALTER TABLE participants ADD COLUMN merged_into TEXT REFERENCES participants(id);

ALTER TABLE expenses ADD COLUMN fx_as_of TEXT;
ALTER TABLE expenses ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'no_fx';
ALTER TABLE expenses ADD COLUMN iof_ppm INTEGER NOT NULL DEFAULT 0;

CREATE TABLE trip_subgroups (
  id              TEXT PRIMARY KEY,
  trip_id         TEXT NOT NULL REFERENCES trips(id),
  label           TEXT,
  participant_ids TEXT NOT NULL,
  last_used_at    TEXT NOT NULL
);

CREATE INDEX idx_subgroups_trip ON trip_subgroups(trip_id, last_used_at DESC);

-- Uma conta não pode estar em dois participantes vivos da mesma viagem (§7.2).
CREATE UNIQUE INDEX uq_participant_user ON participants(trip_id, user_id)
  WHERE user_id IS NOT NULL AND merged_into IS NULL AND deleted_at IS NULL;
`;

/**
 * Terceira migração: as moedas da viagem são escolhidas na abertura.
 *
 * O seletor de moeda listava todas as moedas do mundo em toda despesa. Numa
 * viagem real são duas ou três, e elas são conhecidas antes da primeira
 * despesa — escolher ali reduz o lançamento a um toque.
 */
const TRIP_CURRENCIES = `
CREATE TABLE trip_currencies (
  trip_id  TEXT NOT NULL REFERENCES trips(id),
  code     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, code)
);

-- Viagens que já existem herdam a moeda-base e tudo o que já foi lançado nelas.
INSERT OR IGNORE INTO trip_currencies (trip_id, code, position)
  SELECT id, base_currency, 0 FROM trips;

INSERT OR IGNORE INTO trip_currencies (trip_id, code, position)
  SELECT DISTINCT trip_id, currency, 1 FROM expenses WHERE deleted_at IS NULL;
`;

/** Quarta: preferências do aparelho, como o tema. Não sincroniza — é local. */
const APP_SETTINGS = `
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * Quinta: hora e lugar da despesa.
 *
 * `spent_at` guarda o instante COM O FUSO EM QUE ELE ACONTECEU
 * (`2026-03-14T21:04:00+09:00`), não em UTC. O jantar foi às 21h em Tóquio; se
 * gravássemos só o instante absoluto, ele viraria 09h quando a pessoa
 * conferisse a conta de volta no Brasil — e a lista do dia mudaria de ordem.
 * `spent_on` continua sendo a data local, que é por onde a lista agrupa e a
 * cotação é buscada.
 *
 * As quatro colunas são nulas de propósito: despesa lançada antes desta versão
 * não tem hora nem lugar, e inventar meio-dia seria dizer que sabe.
 */
const EXPENSE_TIME_PLACE = `
ALTER TABLE expenses ADD COLUMN spent_at TEXT;
ALTER TABLE expenses ADD COLUMN place_label TEXT;
ALTER TABLE expenses ADD COLUMN place_lat REAL;
ALTER TABLE expenses ADD COLUMN place_lon REAL;

DROP INDEX IF EXISTS idx_expenses_trip_date;
CREATE INDEX idx_expenses_trip_date
  ON expenses(trip_id, spent_on DESC, spent_at DESC) WHERE deleted_at IS NULL;
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial', sql: INITIAL },
  { version: 2, name: 'pix_iof_subgroups', sql: PIX_IOF_SUBGROUPS },
  { version: 3, name: 'trip_currencies', sql: TRIP_CURRENCIES },
  { version: 4, name: 'app_settings', sql: APP_SETTINGS },
  { version: 5, name: 'expense_time_place', sql: EXPENSE_TIME_PLACE },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
