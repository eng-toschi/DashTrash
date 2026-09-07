# Spec de Build — App de Divisão de Despesas de Viagem

> **Como usar este documento:** ele é um *briefing de execução único*. Entregue o arquivo inteiro
> para um agente de código (Claude Code, Cursor, Codex) com a instrução:
> *"Implemente este spec por completo, na ordem das Fases da §16. Não peça confirmação em
> decisões já resolvidas aqui. Ao final de cada fase, rode os testes e o typecheck e só avance
> se estiverem verdes. Onde o spec não decidir algo, escolha a opção mais simples e documente
> em `docs/DECISIONS.md`."*

---

## 1. Visão geral

**Produto:** app mobile (iOS + Android) para grupos dividirem despesas durante viagens, com
suporte a múltiplas moedas, múltiplos pagadores, divisão por item e acerto de contas simplificado.

**Nome de trabalho:** `Rachei` (substituível — usar constante `APP_NAME` em `src/config/app.ts`).

**Princípios não negociáveis:**

1. **Offline-first de verdade.** Todo fluxo (criar viagem, lançar despesa, ver saldo, acertar
   contas) funciona sem rede, em avião ou roaming. A rede é um detalhe de sincronização.
2. **Dinheiro é inteiro.** Nenhum valor monetário é `float` em nenhum lugar — nem em memória,
   nem no banco, nem no JSON de sync. Sempre inteiros na menor unidade da moeda (centavos).
3. **A soma sempre fecha.** A soma das partes de uma despesa é *exatamente* igual ao total, e a
   soma dos saldos do grupo é *exatamente* zero. Isso é um invariante testado, não uma
   expectativa.
4. **Nada é destrutivo.** Exclusões são *tombstones*. Nenhum dado sai do dispositivo sem
   possibilidade de auditoria/undo.
5. **Menos toques.** Lançar uma despesa comum (valor + quem pagou + divisão igual) deve custar
   no máximo 4 toques a partir da home.

---

## 2. Escopo

### v1 (obrigatório)

- Criar/editar/arquivar viagens com moeda-base, período e capa.
- Participantes locais ("fantasmas", sem conta) e participantes com conta vinculada.
- Despesas com: descrição, valor, moeda, data, categoria, nota, foto de recibo.
- **Múltiplos pagadores** por despesa.
- Modos de divisão: **igual**, **valores exatos**, **porcentagem**, **cotas/pesos**, **por item**.
- Multi-moeda com taxa de câmbio capturada por despesa e cache de cotações.
- Saldos por pessoa, em tempo real, na moeda-base.
- **Acerto de contas** com simplificação de dívidas (mínimo de transferências) e modo "dívidas reais".
- Registro de pagamentos/acertos (settlements).
- Compartilhamento de viagem por link/convite; sync entre dispositivos.
- Exportação CSV e resumo compartilhável (imagem/texto).
- pt-BR e en; tema claro/escuro; acessibilidade.

### Fora do v1 (não implementar)

- Pagamento real / integração com PIX, Stripe, Wise.
- OCR de recibo (deixar o *hook* `parseReceipt()` com stub e feature flag desligada).
- Web app.
- Despesas recorrentes, orçamento por categoria, gráficos avançados.
- Chat no grupo.

---

## 3. Stack e decisões técnicas

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **React Native + Expo (SDK mais recente estável)**, TypeScript strict | Um código, duas lojas; EAS resolve build/submit |
| Navegação | **Expo Router** (file-based) | Deep links de convite quase de graça |
| Banco local | **expo-sqlite** + **Drizzle ORM** + migrações versionadas | SQL de verdade, migração determinística, offline-first |
| Estado servidor | **TanStack Query** apenas para o que vem da rede | Cache/retry/invalidation prontos |
| Estado UI | **Zustand** (stores pequenas e tipadas) | Sem boilerplate de Redux |
| Backend/sync | **Supabase** (Postgres + Auth + Realtime + Storage + RLS) | Auth social pronto, RLS por grupo, realtime para sync |
| Auth | Apple Sign In (obrigatório na App Store), Google, e-mail *magic link* | Requisito de loja + baixo atrito |
| Animação | react-native-reanimated + react-native-gesture-handler | 60fps em listas e sheets |
| Formulários | react-hook-form + **zod** (schemas compartilhados client/server) | Uma fonte de verdade de validação |
| Datas | date-fns + date-fns-tz | Leve, tree-shakeable |
| i18n | i18next + expo-localization | Padrão de mercado |
| Testes | Vitest (unit), @testing-library/react-native (componentes), **Maestro** (e2e) | Rápido + e2e sem flakiness de Detox |
| CI | GitHub Actions: typecheck + lint + test em todo PR; EAS Build em tag | Portão de qualidade |

**Regras de código:**

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- ESLint + Prettier; `import/no-cycle` ligado.
- Proibido: `any` (usar `unknown` + narrowing), `!` non-null assertion, `parseFloat` em dinheiro.
- Toda função de domínio é **pura** e vive em `src/domain/` — sem React, sem SQLite, sem I/O.
  É essa pasta que carrega os testes pesados.

### Estrutura de pastas

```
src/
  app/                 # rotas (Expo Router)
  domain/              # ⭐ lógica pura: money, split, balance, settle, fx
  db/                  # schema drizzle, migrações, repositórios
  sync/                # outbox, aplicação de ops, resolução de conflito
  features/            # trips/, expenses/, settle/, participants/ (UI + hooks)
  ui/                  # design system (Text, Button, Sheet, Money, Avatar...)
  i18n/
  config/
tests/
  domain/              # testes unitários + property-based
  e2e/                 # fluxos Maestro
```

---

## 4. Arquitetura

```
┌────────────────────────────────────────────────────┐
│ UI (Expo Router + features)                        │
├────────────────────────────────────────────────────┤
│ Hooks de leitura (useLiveQuery sobre SQLite)       │
│ Comandos de escrita (dispatchOp)                   │
├────────────────────────────────────────────────────┤
│ domain/ — puro, testável, sem I/O                  │
├────────────────────────────────────────────────────┤
│ SQLite local (fonte de verdade da UI) + Outbox     │
├──────────────── sync worker ───────────────────────┤
│ Supabase Postgres (fonte de verdade compartilhada) │
└────────────────────────────────────────────────────┘
```

**Fluxo de escrita (sempre este, sem exceção):**

1. UI chama um *comando* (`createExpense`, `updateSplit`, `deleteParticipant`…).
2. O comando valida com zod, gera uma **operação** (`Op`) com `id` (uuid v7), `lamport`, `actor_id`.
3. A op é aplicada **localmente** na transação SQLite **e** gravada na tabela `ops_outbox`
   na mesma transação (atomicidade).
4. A UI re-renderiza a partir do SQLite (nunca a partir do retorno da função).
5. O *sync worker* drena o outbox em background, com retry exponencial e *backoff* com jitter.

**Consequência a respeitar:** a UI nunca mostra *spinner* de salvamento. Salvar é local e
instantâneo; a rede só produz um indicador discreto de "sincronizando / pendente".

---

## 5. Modelo de dados

### 5.1 SQLite local (Drizzle) — DDL de referência

```sql
CREATE TABLE trips (
  id            TEXT PRIMARY KEY,           -- uuid v7
  name          TEXT NOT NULL,
  base_currency TEXT NOT NULL,              -- ISO 4217, ex 'BRL'
  starts_on     TEXT,                       -- 'YYYY-MM-DD'
  ends_on       TEXT,
  cover_color   TEXT NOT NULL,
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
  user_id      TEXT,                        -- null = participante "fantasma"
  avatar_seed  TEXT NOT NULL,
  email        TEXT,
  deleted_at   TEXT,
  lamport      INTEGER NOT NULL DEFAULT 0,
  actor_id     TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE expenses (
  id             TEXT PRIMARY KEY,
  trip_id        TEXT NOT NULL REFERENCES trips(id),
  description    TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'other',
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency       TEXT NOT NULL,
  fx_rate_ppm    INTEGER NOT NULL,          -- taxa p/ moeda-base × 1e6, inteiro
  spent_on       TEXT NOT NULL,             -- 'YYYY-MM-DD' (data local do gasto)
  split_type     TEXT NOT NULL,             -- equal|exact|percent|shares|items
  note           TEXT,
  created_by     TEXT NOT NULL,
  deleted_at     TEXT,
  lamport        INTEGER NOT NULL DEFAULT 0,
  actor_id       TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- quem pagou (permite N pagadores); soma DEVE ser igual a expenses.amount_cents
CREATE TABLE expense_payers (
  expense_id     TEXT NOT NULL REFERENCES expenses(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  PRIMARY KEY (expense_id, participant_id)
);

-- quem deve; 'input' é a entrada bruta do usuário conforme split_type,
-- 'computed_cents' é o resultado já arredondado. Soma DEVE bater com o total.
CREATE TABLE expense_shares (
  expense_id     TEXT NOT NULL REFERENCES expenses(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  input_value    INTEGER NOT NULL DEFAULT 0, -- cents | basis points | pesos | 0
  computed_cents INTEGER NOT NULL,
  PRIMARY KEY (expense_id, participant_id)
);

-- divisão por item (split_type='items')
CREATE TABLE expense_items (
  id           TEXT PRIMARY KEY,
  expense_id   TEXT NOT NULL REFERENCES expenses(id),
  label        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  position     INTEGER NOT NULL
);
CREATE TABLE expense_item_consumers (
  item_id        TEXT NOT NULL REFERENCES expense_items(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  PRIMARY KEY (item_id, participant_id)
);

CREATE TABLE settlements (
  id             TEXT PRIMARY KEY,
  trip_id        TEXT NOT NULL REFERENCES trips(id),
  from_id        TEXT NOT NULL REFERENCES participants(id),
  to_id          TEXT NOT NULL REFERENCES participants(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency       TEXT NOT NULL,
  fx_rate_ppm    INTEGER NOT NULL,
  settled_on     TEXT NOT NULL,
  note           TEXT,
  deleted_at     TEXT,
  lamport        INTEGER NOT NULL DEFAULT 0,
  actor_id       TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (from_id <> to_id)
);

CREATE TABLE attachments (
  id         TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  local_uri  TEXT NOT NULL,
  remote_url TEXT,
  bytes      INTEGER,
  uploaded_at TEXT
);

CREATE TABLE fx_rates (
  base       TEXT NOT NULL,
  quote      TEXT NOT NULL,
  as_of      TEXT NOT NULL,     -- 'YYYY-MM-DD'
  rate_ppm   INTEGER NOT NULL,
  PRIMARY KEY (base, quote, as_of)
);

CREATE TABLE ops_outbox (
  id         TEXT PRIMARY KEY,   -- uuid v7 da operação
  trip_id    TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,      -- upsert | delete
  payload    TEXT NOT NULL,      -- JSON
  lamport    INTEGER NOT NULL,
  actor_id   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE sync_state (
  trip_id      TEXT PRIMARY KEY,
  cursor       TEXT,             -- último server_seq aplicado
  last_pull_at TEXT
);

CREATE INDEX idx_expenses_trip_date ON expenses(trip_id, spent_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_shares_participant ON expense_shares(participant_id);
CREATE INDEX idx_payers_participant ON expense_payers(participant_id);
CREATE INDEX idx_settlements_trip   ON settlements(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_outbox_created     ON ops_outbox(created_at);
```

### 5.2 Postgres (Supabase)

Mesmas tabelas, mais:

- `trip_members (trip_id, user_id, role, joined_at)` — `role ∈ {owner, editor}`.
- `trip_invites (token, trip_id, expires_at, max_uses, uses)` — token de 32 bytes aleatórios.
- Coluna `server_seq BIGSERIAL` em cada tabela sincronizada → é o cursor de *pull* incremental.

**RLS (obrigatório, sem exceção):** toda tabela nega por padrão. Política de leitura e escrita:
`EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = <tabela>.trip_id AND m.user_id = auth.uid())`.
Storage de recibos: bucket privado, path `trips/{trip_id}/{expense_id}/{uuid}`, política idêntica.
Escrever teste que confirme que o usuário B **não** lê a viagem do usuário A.

---

## 6. Regras de negócio

### 6.1 Dinheiro

- Tipo `Money = { cents: number; currency: CurrencyCode }`, `cents` inteiro (pode ser negativo em saldos).
- Moedas com expoente ≠ 2 devem funcionar: JPY/KRW (0 casas), BHD/KWD/TND (3 casas).
  Tabela `CURRENCY_EXPONENT` em `domain/money.ts`; formatação via `Intl.NumberFormat`.
- Parsing de entrada aceita `1.234,56`, `1,234.56`, `1234,5`, `1234` — normalizar pelo locale ativo
  e pelo expoente da moeda. Rejeitar (com erro de campo) qualquer entrada com mais casas do que a
  moeda permite, em vez de arredondar em silêncio.
- Operações permitidas em `Money`: `add`, `sub`, `negate`, `allocate`. **Não existe** `multiply`
  por decimal fora de `convert()`.

### 6.2 Arredondamento — `allocate(totalCents, weights[]) → cents[]`

Algoritmo determinístico (*largest remainder*):

1. `exact_i = total × w_i / Σw`; `base_i = floor(exact_i)`.
2. `resto = total − Σ base_i` (0 ≤ resto < n).
3. Distribuir 1 centavo para os `resto` participantes com maior parte fracionária;
   **empate resolvido pelo `participant_id` em ordem lexicográfica crescente** (determinismo
   entre dispositivos é o ponto: dois celulares devem chegar ao mesmo centavo).
4. Invariante testado: `Σ resultado === totalCents` para todo input, inclusive `total` negativo,
   `n = 1`, pesos zerados e pesos gigantes.

### 6.3 Modos de divisão

| Modo | Entrada | Validação |
|---|---|---|
| `equal` | conjunto de participantes | ≥ 1 participante |
| `exact` | centavos por pessoa | soma **exatamente** igual ao total; UI mostra "faltam R$ X" em tempo real e bloqueia o salvar |
| `percent` | *basis points* (1% = 100 bp) | soma = 10.000 bp exatos |
| `shares` | pesos inteiros ≥ 0 (ex.: casal = 2) | Σ pesos > 0 |
| `items` | itens + consumidores + rateio de taxa/gorjeta | Σ itens ≤ total; sobra (serviço/taxa) é rateada **proporcionalmente ao consumo de cada um**, com `allocate` |

Casos de borda a tratar explicitamente:

- Item sem consumidor marcado → rateia entre **todos** os participantes da despesa.
- Participante que só pagou e não consumiu (fica com share 0) é válido.
- Participante que consumiu e não pagou é o caso normal.
- Despesa cujo pagador não é participante da divisão é válida.

### 6.4 Câmbio

- Cada despesa guarda `fx_rate_ppm` = taxa **da moeda da despesa para a moeda-base da viagem**,
  fixada no momento do lançamento (não recalcular retroativamente — a viagem inteira mudaria de
  saldo ao abrir o app dias depois).
- Fonte: API pública de cotação (ex.: `exchangerate.host` / `open.er-api.com`), com cache em
  `fx_rates` por dia. Sem rede: usar a cotação mais recente em cache; se não houver nenhuma,
  pedir a taxa ao usuário (campo editável) e marcar a despesa com badge "taxa manual".
- A taxa é **sempre editável** pelo usuário na tela da despesa.
- Conversão: `baseCents = round(cents × rate_ppm / 1_000_000)` com ajuste de expoente entre moedas
  de casas diferentes; `round` = *half away from zero*.

### 6.5 Saldos

Para cada participante `p`, na moeda-base:

```
pago(p)   = Σ payers.amount_cents (convertidos)  +  Σ settlements onde from_id = p
deve(p)   = Σ shares.computed_cents (convertidos) +  Σ settlements onde to_id = p
saldo(p)  = pago(p) − deve(p)
```

`saldo > 0` → tem a receber. `saldo < 0` → deve. **Invariante:** `Σ saldo(p) = 0` exatamente.
Se o cálculo der ≠ 0 (só pode acontecer por bug de arredondamento em conversão), o app **não**
disfarça: registra erro em `console.error` + Sentry e exibe o resíduo numa linha "diferença de
arredondamento" para o usuário, em vez de mentir.

### 6.6 Acerto de contas

Dois modos, alternáveis por um *toggle* na tela de acerto:

**A. Simplificado (padrão)** — minimiza o número de transferências:

```
devedores  = [p com saldo < 0], ordenados por |saldo| desc
credores   = [p com saldo > 0], ordenados por saldo desc
enquanto houver ambos:
  v = min(|saldo devedor topo|, saldo credor topo)
  emitir transferência devedor → credor de v
  abater v de ambos; remover quem zerou
```

Resulta em ≤ n−1 transferências (não é o ótimo global, que é NP-difícil, e isso é aceitável —
documentar no código). Determinístico: empates ordenados por `participant_id`.

**B. Dívidas reais** — mantém o par credor/devedor derivado das despesas efetivas,
sem redirecionar pagamentos entre pessoas que não interagiram.

Registrar um acerto cria um `settlement`, que entra no cálculo de saldo — nunca apaga despesas.

---

## 7. Sincronização e conflitos

- **Relógio:** Lamport por dispositivo. `lamport = max(local, recebido) + 1` a cada op.
- **Resolução:** last-writer-wins por entidade, comparando a tupla `(lamport, actor_id)` —
  `actor_id` desempata lexicograficamente, o que garante que **todos os dispositivos convergem
  para o mesmo resultado** sem coordenação.
- **Exclusão:** tombstone (`deleted_at`). Uma edição com lamport maior que uma exclusão
  **ressuscita** o registro (comportamento escolhido: perder um gasto é pior que ver um gasto que
  alguém tentou apagar). Documentar.
- **Filhos (payers/shares/items):** substituição atômica do conjunto inteiro junto com a despesa
  pai — nunca merge parcial de linhas, que produziria uma despesa cuja soma não fecha.
- **Pull:** `GET rows WHERE trip_id = ? AND server_seq > cursor ORDER BY server_seq` + Realtime
  para o caso online. Aplicar em transação, avançar cursor no fim.
- **Push:** drenar `ops_outbox` em ordem de `created_at`; a op é idempotente pelo `id` (upsert com
  `ON CONFLICT (id) DO NOTHING` na tabela de ops do servidor).
- **Retry:** exponencial 1s→2s→4s→…→5min com jitter; após 10 falhas, marcar `last_error` e mostrar
  banner "não foi possível sincronizar" com botão "tentar agora" e "ver detalhes".
- **Nunca** bloquear a UI esperando sync. Nunca perder o outbox: ele é SQLite, não memória.

---

## 8. Telas e fluxos

Cada tela precisa de **quatro estados implementados**: carregando (skeleton, não spinner
centralizado), vazio (com ação primária), erro (com retry) e conteúdo.

1. **Onboarding** (3 telas, puláveis) → login social ou "usar sem conta" (viagem só local, com
   aviso claro de que não sincroniza).
2. **Home — Minhas viagens.** Cards com nome, período, seu saldo (verde/vermelho), avatares.
   Seções "Ativas" e "Arquivadas". FAB "Nova viagem".
3. **Nova viagem.** Nome, moeda-base (default = moeda do locale), datas opcionais, cor,
   participantes (adicionar nome livre, sem exigir conta).
4. **Viagem — aba Despesas.** Lista agrupada por dia, com cabeçalho *sticky* de data; cada linha:
   ícone da categoria, descrição, "Fulano pagou R$ X", e à direita seu impacto pessoal
   ("você deve R$ 12,50" / "você emprestou R$ 40"). Busca e filtro por pessoa/categoria.
5. **Nova despesa (a tela mais importante — otimizar o caminho rápido).**
   Teclado numérico grande abre já focado; valor → descrição → "quem pagou" (default: você) →
   "dividir entre" (default: todos, igual) → salvar. Modos avançados atrás de um seletor,
   não à frente. Suporte a foto de recibo e a mudar a moeda inline.
6. **Detalhe da despesa.** Quem pagou, quem deve quanto, taxa de câmbio usada (editável),
   recibo, histórico de edições, excluir (com undo em snackbar de 5s).
7. **Viagem — aba Saldos.** Barra por pessoa (positivo/negativo), total gasto na viagem,
   gasto médio por pessoa, "você" destacado.
8. **Acertar contas.** Lista de transferências sugeridas ("Ana paga R$ 87,30 a Bruno"), toggle
   simplificado/real, botão "marcar como pago" por linha, e botão "compartilhar acerto".
9. **Participantes.** Adicionar/renomear/remover. **Remover só é permitido se a pessoa tiver
   saldo zero e nenhuma despesa** — caso contrário, oferecer "arquivar participante"
   (some das novas divisões, permanece no histórico). Isso evita corromper saldos.
10. **Convite.** Gera link `rachei://join/{token}` + universal link `https://<dominio>/join/{token}`,
    com QR code para uso presencial (o caso real: mesa de restaurante).
11. **Ajustes.** Idioma, tema, moeda padrão, exportar CSV, apagar dados locais, sobre.

---

## 9. Design system

- Definir tokens em `src/ui/tokens.ts`: cores (semânticas, não literais — `bg`, `bgElevated`,
  `text`, `textMuted`, `positive`, `negative`, `accent`), espaçamento base 4, raios, tipografia,
  sombras. Tema claro e escuro derivados dos mesmos tokens semânticos.
- Componentes: `Text`, `Button` (primary/secondary/ghost/destructive, com estado `loading` e
  `disabled`), `Input`, `MoneyInput`, `Money` (formatador), `Avatar`, `Card`, `Sheet`,
  `ListRow`, `SegmentedControl`, `EmptyState`, `Skeleton`, `Snackbar`, `Chip`.
- Nada de valor de cor ou espaçamento *hard-coded* fora de `tokens.ts` — regra de lint.
- Toque mínimo 44×44pt. Feedback háptico em ações de confirmação (`expo-haptics`).
- Números monetários em fonte tabular (`fontVariant: ['tabular-nums']`) para não "dançar".

---

## 10. Notificações e deep links

- `expo-notifications`: push quando alguém adiciona despesa que te afeta, quando te convidam e
  quando marcam um acerto com você. Silenciável por viagem. **Pedir permissão só depois** da
  primeira despesa criada, nunca na abertura.
- Deep link scheme `rachei://` + Universal/App Links. Rotas: `/join/{token}`,
  `/trip/{id}`, `/trip/{id}/expense/{id}`.
- Cold start com deep link deve levar à tela certa depois do login, sem perder o destino.

---

## 11. Segurança e privacidade

- Tokens de sessão no **SecureStore** (Keychain/Keystore), nunca em AsyncStorage.
- RLS ativa em todas as tabelas; validar no servidor tudo o que o cliente valida.
- Convite: token de alta entropia, expira em 7 dias, revogável, limite de usos.
- Recibos em bucket privado com URLs assinadas de curta duração.
- Sem analytics de terceiros no v1 além de Sentry (com `sendDefaultPii: false` e scrubbing de
  descrições de despesa).
- Tela "Apagar minha conta" que realmente apaga (requisito de App Store e LGPD/GDPR).
- Política de privacidade e `app.json` com as *privacy manifests* do iOS preenchidas.

---

## 12. Resiliência e observabilidade

- **Error boundary** por rota, com tela de erro amigável e botão "reportar".
- Sentry com *release health*; breadcrumb em toda op de sync.
- Log estruturado local (ring buffer de 500 entradas) exportável em Ajustes → "Enviar
  diagnóstico" — indispensável para depurar bug de saldo relatado por usuário.
- Migrações de banco: numeradas, testadas com fixture da versão anterior; **teste que roda toda
  migração da v1 até a atual num banco populado** e verifica os invariantes de saldo.
- Feature flags simples em `config/flags.ts` (OCR, simplificação, multi-pagador).

---

## 13. i18n e acessibilidade

- pt-BR (padrão) e en. Nenhuma string literal na UI — tudo por chave.
- Pluralização e formatação de moeda/data pelo `Intl` com o locale ativo.
- Todo elemento interativo com `accessibilityLabel` e `accessibilityRole`; testar com
  VoiceOver e TalkBack; suportar fonte ampliada (layouts não podem quebrar em `fontScale` 1.5);
  contraste AA mínimo; respeitar `prefers-reduced-motion`.

---

## 14. Testes

**Portão de qualidade: `npm run verify` = typecheck + lint + testes. Nada é considerado pronto sem ele verde.**

### Unitários obrigatórios em `domain/` (cobertura ≥ 90% nessa pasta)

- `allocate`: property-based (fast-check) — para qualquer total e quaisquer pesos,
  `Σ resultado === total` e nenhuma parte é negativa quando o total é positivo.
- Divisão igual de R$ 100,00 entre 3 → `[3334, 3333, 3333]`, e a mesma entrada em qualquer
  ordem de participantes produz a **mesma** atribuição.
- `exact` com soma divergente → erro de validação, nunca salva.
- `percent` com 33,33% × 3 → rejeita (9.999 bp) com mensagem clara.
- `items` com taxa de serviço de 10% rateada proporcionalmente.
- Multi-pagador: 2 pagadores, 4 devedores, moedas mistas → `Σ saldos === 0`.
- Moeda sem casas decimais (JPY) e com 3 casas (KWD).
- Simplificação: cenário de 5 pessoas gera ≤ 4 transferências e preserva todos os saldos.
- Settlement parcial (paguei metade) mantém o resto devido.
- Property-based geral: para qualquer viagem gerada aleatoriamente (despesas, moedas, acertos),
  `Σ saldos === 0`.

### Sync

- Duas réplicas simuladas aplicando ops fora de ordem convergem para estado idêntico.
- Edição concorrente da mesma despesa em dois dispositivos → mesmo vencedor nos dois.
- Delete vs. edição concorrente → comportamento documentado (§7) em ambos.
- Outbox sobrevive a *kill* do app no meio do envio (nenhuma op perdida, nenhuma duplicada).

### E2E (Maestro)

1. Criar viagem → 3 participantes → 3 despesas → conferir saldos → acertar → saldos zerados.
2. Modo avião: criar despesa offline, matar o app, reabrir, voltar online, confirmar sync.
3. Convite: dispositivo B entra pelo link e vê as despesas do A.
4. Divisão por item num restaurante com gorjeta.

---

## 15. Build, CI e lojas

- `eas.json` com perfis `development`, `preview` (APK + simulator build) e `production`.
- GitHub Actions: PR → `npm run verify`; tag `v*` → EAS Build iOS+Android e `eas submit`.
- `app.json`: bundle ids, ícones (1024²), splash, permissões com **texto de justificativa em
  pt-BR e en** (câmera → "para fotografar recibos"; fotos; notificações).
- Checklist de loja: política de privacidade publicada, Sign in with Apple presente se houver
  qualquer login social, exclusão de conta no app, screenshots nos tamanhos exigidos,
  classificação etária, e `NSPhotoLibraryUsageDescription` etc. preenchidos.
- Versionamento: `expo-updates` para correção rápida de JS; incrementar `runtimeVersion` em
  mudança nativa.

---

## 16. Ordem de implementação (fases)

Cada fase termina com `npm run verify` verde e um commit. **Não pule para a fase seguinte com
teste vermelho.**

| Fase | Entrega | Critério de aceite |
|---|---|---|
| **0** | Projeto Expo + TS strict + lint + Vitest + estrutura de pastas + CI | `npm run verify` roda e passa em CI |
| **1** | `domain/`: money, allocate, splits, balances, settle, fx — **puro, sem UI** | Toda a §14 "Unitários obrigatórios" verde. **Esta é a fase mais importante do projeto** |
| **2** | SQLite + Drizzle + migrações + repositórios + comandos com outbox | Teste de migração e de atomicidade (op + estado na mesma transação) |
| **3** | Design system + navegação + telas de viagem/despesa/saldo, 100% offline, sem backend | E2E #1 passa; app usável de ponta a ponta sem rede |
| **4** | Modos avançados de divisão (exato, %, cotas, itens) + multi-pagador + multi-moeda | E2E #4 passa; badge de taxa manual funciona |
| **5** | Acerto de contas (dois modos) + settlements + compartilhar resumo | E2E #1 fecha em saldo zero |
| **6** | Supabase: auth, schema, RLS, sync worker, realtime, convites, deep links | E2E #2 e #3 passam; teste de RLS negando acesso cruzado |
| **7** | Recibos + Storage, notificações, exportar CSV | Upload resiliente a queda de rede (retomável) |
| **8** | i18n, acessibilidade, tema escuro, polimento, estados vazios/erro | Auditoria de a11y sem falhas críticas; `fontScale` 1.5 sem quebra |
| **9** | Sentry, diagnósticos, EAS Build, ícones, metadados de loja | Build de produção instalável nas duas plataformas |

---

## 17. Definition of Done (global)

- [ ] `npm run verify` verde; cobertura de `domain/` ≥ 90%.
- [ ] Todos os fluxos da §8 funcionam **em modo avião**.
- [ ] `Σ saldos = 0` verificado por teste property-based em viagens aleatórias.
- [ ] Nenhum `any`, nenhum `float` em caminho monetário, nenhuma cor fora dos tokens (lint garante).
- [ ] Dois dispositivos convergem para o mesmo estado após edição offline simultânea.
- [ ] RLS testada: usuário fora do grupo não lê nada.
- [ ] App abre em < 2s em Android mid-range; lista de 500 despesas rola a 60fps.
- [ ] pt-BR e en completos; VoiceOver e TalkBack navegam todas as telas.
- [ ] Builds de produção iOS e Android gerados pelo EAS.
- [ ] `docs/DECISIONS.md` registra toda decisão tomada fora deste spec.

---

## 18. Armadilhas conhecidas (leia antes de codar)

1. **Não recalcule câmbio retroativamente.** A taxa é fixada no lançamento. Recalcular faz o
   saldo de uma viagem encerrada mudar sozinho — é o bug que mais destrói confiança nesse tipo de app.
2. **Não use `float` "só no cálculo intermediário".** `0.1 + 0.2` já erra; três pessoas e uma
   gorjeta e a soma não fecha.
3. **Não permita remover participante com histórico.** Arquive.
4. **Não empurre `spinner` de salvamento.** Salvar é local.
5. **Não faça merge linha a linha de shares.** Substitua o conjunto inteiro, ou uma despesa acaba
   com partes que não somam o total.
6. **Não peça login antes de mostrar valor.** Deixe criar a primeira viagem local.
7. **Não confie no relógio do dispositivo para ordenar ops.** Use Lamport; o celular do amigo
   pode estar com a data errada.
