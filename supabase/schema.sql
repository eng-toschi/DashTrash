-- Schema compartilhado do RachaPila (Fase 6 — spec §5.4, §10, §12).
--
-- Espelha as tabelas do SQLite do aparelho (src/db/migrations.ts), mais o que
-- só existe porque agora há mais de um dispositivo: quem pertence a qual
-- viagem (trip_members) e o convite (trip_invites).
--
-- Cole este arquivo inteiro no SQL Editor do Supabase (painel do projeto →
-- SQL Editor → New query) e rode uma vez. É seguro rodar de novo: todo
-- `create` usa `if not exists`.
--
-- O que ESTE arquivo NÃO faz — de propósito, é a próxima etapa:
--   - Não grava nada quando uma despesa é criada no aparelho. Isso é o
--     trabalho de sincronização (push/pull do ops_outbox), que só dá para
--     escrever e testar depois que este schema existir de verdade.
--   - `fx_rates` do aparelho não tem tabela aqui: é cache de uma cotação
--     pública, sem dono — cada aparelho pode buscar de novo, não precisa
--     sincronizar. `ops_outbox`, `sync_state` e `device_state` também ficam
--     de fora: são a mecânica de transporte do PRÓPRIO aparelho, nunca saem
--     dele.
--   - Fotos de recibo (`attachments`) ficam para a Fase 7 (Storage) — a
--     coluna já existe no SQLite mas nada no app escreve nela ainda.

-- ---------------------------------------------------------------------------
-- Viagens e quem pode ver cada uma
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  id            uuid primary key,
  name          text not null,
  base_currency text not null,
  starts_on     date,
  ends_on       date,
  cover_color   text not null default '#6D4AFF',
  archived_at   timestamptz,
  deleted_at    timestamptz,
  lamport       bigint not null default 0,
  actor_id      text not null,
  updated_at    timestamptz not null default now(),
  server_seq    bigserial not null
);

-- Só as moedas escolhidas na abertura da viagem (espelha trip_currencies do
-- aparelho). Sincroniza junto com a viagem: o comando local grava as duas
-- coisas na mesma operação (`entity: 'trip'`, payload com `currencies`).
create table if not exists public.trip_currencies (
  trip_id  uuid not null references public.trips(id),
  code     text not null,
  position integer not null default 0,
  primary key (trip_id, code)
);

-- Quem enxerga a viagem. `role` existe desde já (spec §5.4) mas o app ainda
-- não distingue owner de editor — todo membro pode editar por enquanto.
create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips(id),
  user_id   uuid not null references auth.users(id),
  role      text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Participantes, despesas, partes, acertos — mesmas colunas do aparelho
-- ---------------------------------------------------------------------------

create table if not exists public.participants (
  id           uuid primary key,
  trip_id      uuid not null references public.trips(id),
  display_name text not null,
  user_id      uuid references auth.users(id),   -- NULL = fantasma
  avatar_seed  text not null,
  email        text,
  pix_key      text,
  pix_key_kind text,
  pix_name     text,
  pix_city     text,
  merged_into  uuid references public.participants(id),
  archived_at  timestamptz,
  deleted_at   timestamptz,
  lamport      bigint not null default 0,
  actor_id     text not null,
  updated_at   timestamptz not null default now(),
  server_seq   bigserial not null
);

-- Mesma regra do aparelho (migração 2): uma conta não pode estar vinculada a
-- dois participantes vivos da mesma viagem.
create unique index if not exists uq_participant_user
  on public.participants(trip_id, user_id)
  where user_id is not null and merged_into is null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Convite (§7.2) — direcionado (aponta para um fantasma) ou genérico
--
-- Vem depois de `participants` de propósito: `participant_id` referencia essa
-- tabela, e o Postgres exige que ela já exista.
-- ---------------------------------------------------------------------------

create table if not exists public.trip_invites (
  token          text primary key,               -- 32 bytes aleatórios, gerado no app
  trip_id        uuid not null references public.trips(id),
  -- NULL = convite genérico (QR da mesa do restaurante): quem entra escolhe
  -- "quem é você?" entre os fantasmas ainda não vinculados (§7.2 regra 2).
  -- Preenchido = convite direcionado: aceitar vincula a ESTE participante e
  -- herda o histórico dele, sem criar ninguém novo (§7.2 regra 1).
  participant_id uuid references public.participants(id),
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '7 days'),
  max_uses       integer not null default 1,
  uses           integer not null default 0
);

create table if not exists public.expenses (
  id             uuid primary key,
  trip_id        uuid not null references public.trips(id),
  description    text not null,
  category       text not null default 'other',
  amount_cents   bigint not null check (amount_cents > 0),
  currency       text not null,
  fx_rate_ppm    bigint not null,
  fx_manual      boolean not null default false,
  fx_as_of       date,
  payment_method text not null default 'no_fx',
  iof_ppm        bigint not null default 0,
  spent_on       date not null,
  -- Instante COM FUSO, como texto — igual ao aparelho (migração 5). Não vira
  -- `timestamptz`: perderia o fuso em que a despesa aconteceu, que é
  -- justamente o que essa coluna existe para preservar (ver DECISIONS.md).
  spent_at       text,
  place_label    text,
  place_lat      double precision,
  place_lon      double precision,
  paid_by        uuid not null references public.participants(id),
  split_type     text not null check (split_type in ('equal', 'exact')),
  note           text,
  created_by     text not null,
  deleted_at     timestamptz,
  lamport        bigint not null default 0,
  actor_id       text not null,
  updated_at     timestamptz not null default now(),
  server_seq     bigserial not null
);

create table if not exists public.expense_shares (
  expense_id     uuid not null references public.expenses(id),
  participant_id uuid not null references public.participants(id),
  input_cents    bigint not null default 0,
  computed_cents bigint not null,
  position       integer not null default 0,
  primary key (expense_id, participant_id)
);

create table if not exists public.settlements (
  id           uuid primary key,
  trip_id      uuid not null references public.trips(id),
  from_id      uuid not null references public.participants(id),
  to_id        uuid not null references public.participants(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency     text not null,
  fx_rate_ppm  bigint not null,
  settled_on   date not null,
  note         text,
  deleted_at   timestamptz,
  lamport      bigint not null default 0,
  actor_id     text not null,
  updated_at   timestamptz not null default now(),
  server_seq   bigserial not null,
  check (from_id <> to_id)
);

create table if not exists public.trip_subgroups (
  id              uuid primary key,
  trip_id         uuid not null references public.trips(id),
  label           text,
  participant_ids text not null,   -- mesmo formato do aparelho: JSON de ids, ordenado
  last_used_at    timestamptz not null default now()
);

create index if not exists idx_expenses_trip_date
  on public.expenses(trip_id, spent_on desc, spent_at desc) where deleted_at is null;
create index if not exists idx_shares_participant on public.expense_shares(participant_id);
create index if not exists idx_settlements_trip on public.settlements(trip_id) where deleted_at is null;
create index if not exists idx_participants_trip on public.participants(trip_id) where deleted_at is null;
create index if not exists idx_subgroups_trip on public.trip_subgroups(trip_id, last_used_at desc);

-- ---------------------------------------------------------------------------
-- RLS — nega por padrão, libera só para quem está em trip_members (§5.4, §12)
-- ---------------------------------------------------------------------------

-- Função helper para não repetir o mesmo EXISTS em toda política. `security
-- definer` porque a política de `trip_members` não pode depender de ler
-- `trip_members` para decidir se pode ler `trip_members` — viraria círculo.
create or replace function public.is_trip_member(check_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = check_trip_id and user_id = auth.uid()
  );
$$;

alter table public.trips            enable row level security;
alter table public.trip_currencies  enable row level security;
alter table public.trip_members     enable row level security;
alter table public.trip_invites     enable row level security;
alter table public.participants     enable row level security;
alter table public.expenses         enable row level security;
alter table public.expense_shares   enable row level security;
alter table public.settlements      enable row level security;
alter table public.trip_subgroups   enable row level security;

create policy "member reads trip" on public.trips
  for select using (public.is_trip_member(id));
create policy "member writes trip" on public.trips
  for all using (public.is_trip_member(id)) with check (public.is_trip_member(id));

create policy "member reads trip_currencies" on public.trip_currencies
  for select using (public.is_trip_member(trip_id));
create policy "member writes trip_currencies" on public.trip_currencies
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create policy "member reads trip_members" on public.trip_members
  for select using (public.is_trip_member(trip_id));
-- Ninguém escreve em trip_members direto do cliente: entrar numa viagem
-- passa pela função de aceitar convite (abaixo), que roda com privilégio de
-- servidor e confere o token antes de inserir a linha.

create policy "member reads trip_invites" on public.trip_invites
  for select using (public.is_trip_member(trip_id));
create policy "member creates trip_invites" on public.trip_invites
  for insert with check (public.is_trip_member(trip_id));

create policy "member reads participants" on public.participants
  for select using (public.is_trip_member(trip_id));
create policy "member writes participants" on public.participants
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create policy "member reads expenses" on public.expenses
  for select using (public.is_trip_member(trip_id));
create policy "member writes expenses" on public.expenses
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create policy "member reads expense_shares" on public.expense_shares
  for select using (
    exists (select 1 from public.expenses e
            where e.id = expense_id and public.is_trip_member(e.trip_id))
  );
create policy "member writes expense_shares" on public.expense_shares
  for all using (
    exists (select 1 from public.expenses e
            where e.id = expense_id and public.is_trip_member(e.trip_id))
  ) with check (
    exists (select 1 from public.expenses e
            where e.id = expense_id and public.is_trip_member(e.trip_id))
  );

create policy "member reads settlements" on public.settlements
  for select using (public.is_trip_member(trip_id));
create policy "member writes settlements" on public.settlements
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create policy "member reads trip_subgroups" on public.trip_subgroups
  for select using (public.is_trip_member(trip_id));
create policy "member writes trip_subgroups" on public.trip_subgroups
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- Aceitar convite (§7.2) — a ÚNICA porta de entrada em trip_members
-- ---------------------------------------------------------------------------

-- `security definer`: quem ainda não é membro não passaria pela RLS de
-- `trip_members`/`trip_invites` para se inserir sozinho — é por isso que
-- "ninguém escreve em trip_members direto" acima é uma regra de verdade, não
-- só um comentário. Confere token, validade e limite de usos antes de tudo.
create or replace function public.accept_trip_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.trip_invites;
begin
  select * into invite from public.trip_invites where token = invite_token for update;

  if invite is null then
    raise exception 'convite não encontrado' using errcode = 'P0002';
  end if;
  if invite.expires_at < now() then
    raise exception 'convite expirado' using errcode = 'P0001';
  end if;
  if invite.uses >= invite.max_uses then
    raise exception 'convite já usado' using errcode = 'P0001';
  end if;

  update public.trip_invites set uses = uses + 1 where token = invite_token;

  insert into public.trip_members (trip_id, user_id)
  values (invite.trip_id, auth.uid())
  on conflict (trip_id, user_id) do nothing;

  -- Convite direcionado: vincula ao fantasma e devolve o id dele, para o
  -- app saber "você é este participante" sem uma segunda pergunta.
  if invite.participant_id is not null then
    update public.participants
    set user_id = auth.uid()
    where id = invite.participant_id and user_id is null and merged_into is null;
  end if;

  return invite.trip_id;
end;
$$;
