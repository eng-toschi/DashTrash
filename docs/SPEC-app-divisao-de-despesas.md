# Spec de Build — App de Divisão de Despesas de Viagem

> **Como usar este documento:** é um *briefing de execução único*. Entregue o arquivo inteiro
> para um agente de código com a instrução:
> *"Implemente este spec por completo, na ordem das Fases da §14. Não peça confirmação em
> decisões já resolvidas aqui. Ao final de cada fase, rode `npm run verify` e só avance se
> estiver verde. Onde o spec não decidir algo, escolha a opção mais simples e registre em
> `docs/DECISIONS.md`."*

---

## 1. O que é

App mobile (iOS + Android) para um grupo dividir despesas durante viagens **internacionais**.
Cada pessoa instala no próprio celular, lança suas despesas e tudo sincroniza entre os
dispositivos. Uso privado — entre amigos, sem publicação nas lojas.

**Nome de trabalho:** `RachaPila` (constante `APP_NAME` em `src/config/app.ts`).

### As quatro decisões que definem o escopo

| Decisão | Consequência técnica |
|---|---|
| **Todos instalam e sincronizam** | Backend real, contas, convites, sync offline e resolução de conflito. É a maior parte do trabalho. |
| **Viagem internacional, várias moedas** | Câmbio por despesa, cache de cotação, funcionamento sem rede no exterior. |
| **Divisão simples: igual e valor exato** | Sem porcentagem, sem cotas, sem divisão por item, **um pagador por despesa**. Corta ~40% da complexidade de domínio. |
| **Só para você e seus amigos** | Sem revisão de loja, sem Sign in with Apple, sem política de privacidade. Distribuição por APK e TestFlight. |

### Princípios não negociáveis

1. **Offline-first de verdade.** Todo fluxo funciona em avião e em roaming ruim no exterior —
   que é exatamente onde o app vai ser usado. A rede é um detalhe de sincronização.
2. **Dinheiro é inteiro.** Nenhum valor monetário é `float` em lugar nenhum — nem em memória,
   nem no banco, nem no JSON de sync. Sempre inteiros na menor unidade da moeda.
3. **A soma sempre fecha.** A soma das partes de uma despesa é *exatamente* o total, e a soma
   dos saldos do grupo é *exatamente* zero. Invariante testado, não expectativa.
4. **Nada é destrutivo.** Exclusão é *tombstone*, com undo.
5. **Menos toques.** Lançar a despesa típica (valor + divisão igual entre todos) custa no
   máximo 4 toques a partir da home.

---

## 2. Escopo

### v1 — construir

- Viagens com moeda-base, período, capa; arquivar.
- Participantes: com conta (sincronizam) e "fantasmas" (alguém que não instalou o app, mas
  participa das contas).
- Despesas: descrição, valor, moeda, data, categoria, nota, foto de recibo, **um pagador**.
- Divisão **igual** (entre todos ou entre um subgrupo) e por **valor exato**.
- **Subgrupos salvos**: quem esteve junto no jantar de ontem vira um atalho para o de hoje.
- Multi-moeda com **a cotação do dia do gasto** fixada por despesa + cache de cotações + taxa manual offline.
- **IOF** por forma de pagamento, com alíquota congelada na despesa e visível na decomposição.
- **Chave Pix** por participante e "copia e cola" gerado offline no fechamento.
- No fechamento, **pagar em reais ou em outra moeda** da viagem.
- Saldos por pessoa, em tempo real, na moeda-base.
- Acerto de contas com simplificação de dívidas + registro de pagamentos.
- Convite por link/QR e **vinculação** do participante fantasma à conta de quem aceita.
- Sync entre dispositivos, tempo real quando online.
- **Fechamento da viagem**: total gasto, gasto por pessoa e a lista final de quem paga a quem.
- Exportar CSV e compartilhar resumo.
- pt-BR e en, tema claro/escuro, acessibilidade.

### Cortado de propósito (e como voltar depois)

| Cortado | Por quê | Custo de adicionar depois |
|---|---|---|
| Divisão por %, cotas e por item | Escopo "simples" | Médio — `domain/split.ts` já é uma união discriminada; adicionar variantes não quebra o resto |
| **Múltiplos pagadores** | Escopo "simples" | Baixo — migração que troca `expenses.paid_by` por uma tabela `expense_payers`; o cálculo de saldo já isola isso numa função só |
| OCR de recibo | Alto custo, baixo retorno no v1 | Hook `parseReceipt()` fica como stub atrás de feature flag |
| Requisitos de loja | Distribuição privada | Ver §15 |
| Web app, chat, orçamentos, gráficos | Fora do problema | — |

**Regra para o agente:** implementar o que está no v1. Não "aproveitar que está aqui" e
adicionar modos de divisão extras — a complexidade cortada é o que torna esse app entregável.

---

## 3. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **Expo + React Native**, TypeScript strict | Um código, dois sistemas; EAS resolve os builds |
| Navegação | **Expo Router** | Deep link de convite quase de graça |
| Banco local | **expo-sqlite** + SQL direto atrás de uma porta fina + migrações numeradas | SQL de verdade, offline-first, migração determinística, sem acoplar a versão do driver nativo (ver `docs/DECISIONS.md`) |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage + RLS) | Auth e RLS por grupo prontos; realtime para sync |
| Auth | **Magic link por e-mail** (Supabase), sem senha | Zero atrito, zero conta de desenvolvedor extra. Sem Apple/Google Sign In — só são exigidos por loja, e não vamos publicar |
| Estado servidor | TanStack Query (só para o que vem da rede) | Retry/cache prontos |
| Estado UI | Zustand | Sem boilerplate |
| Validação | zod (schemas compartilhados client/server) | Uma fonte de verdade |
| Animação | reanimated + gesture-handler | 60fps em listas e sheets |
| Datas | date-fns | Leve |
| i18n | i18next + expo-localization | Padrão |
| Testes | Vitest + fast-check (unit), @testing-library/react-native, **Maestro** (e2e) | Rápido, e2e sem flakiness |
| Erros | Sentry | Bug de saldo sem log é indepurável |

**Regras de código**

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- Proibido: `any`, `!` non-null assertion, `parseFloat` em caminho monetário, cor ou espaçamento
  fora dos tokens. Tudo isso vira regra de ESLint, não recomendação.
- Toda lógica de domínio é **pura**, vive em `src/domain/`, e não importa React, SQLite nem rede.

```
src/
  app/         # rotas (Expo Router)
  domain/      # ⭐ money, split, fx, balance, settle — puro e testado
  db/          # schema drizzle, migrações, repositórios
  sync/        # outbox, apply, conflito
  features/    # trips/ expenses/ settle/ participants/
  ui/          # design system
  i18n/ config/
tests/domain/  tests/sync/  tests/e2e/
```

---

## 4. Arquitetura

```
UI (Expo Router)
  ↓ leitura: queries reativas sobre SQLite    ↑ re-render
  ↓ escrita: comandos → Op
domain/  (puro)
  ↓
SQLite local  +  ops_outbox      ← fonte de verdade da UI
  ↕ sync worker (background, retry)
Supabase Postgres               ← fonte de verdade compartilhada
```

**Fluxo de escrita — sempre este, sem exceção:**

1. UI chama um comando (`createExpense`, `updateExpense`, `settleUp`…).
2. Comando valida com zod e gera uma **Op** com `id` (uuid v7), `lamport`, `actor_id`.
3. A Op é aplicada no SQLite **e** gravada no `ops_outbox` **na mesma transação**.
4. A UI re-renderiza a partir do SQLite — nunca a partir do retorno da função.
5. O sync worker drena o outbox em background com retry exponencial.

**Consequência:** não existe spinner de salvamento. Salvar é local e instantâneo. A rede produz
apenas um indicador discreto de "sincronizando / N pendentes".

---

## 5. Modelo de dados

### 5.1 SQLite local

```sql
CREATE TABLE trips (
  id            TEXT PRIMARY KEY,          -- uuid v7
  name          TEXT NOT NULL,
  base_currency TEXT NOT NULL,             -- ISO 4217, moeda do acerto final
  starts_on     TEXT, ends_on TEXT,        -- 'YYYY-MM-DD'
  cover_color   TEXT NOT NULL,
  archived_at   TEXT, deleted_at TEXT,
  lamport INTEGER NOT NULL DEFAULT 0, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE participants (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id),
  display_name TEXT NOT NULL,
  user_id      TEXT,                       -- null = "fantasma", não instalou o app
  avatar_seed  TEXT NOT NULL,
  email        TEXT,
  pix_key      TEXT,                      -- normalizada; dado pessoal, ver §12
  pix_key_kind TEXT,                      -- cpf | cnpj | email | phone | random
  pix_name     TEXT,                      -- nome do recebedor no BR Code
  pix_city     TEXT,
  merged_into  TEXT REFERENCES participants(id),  -- ver §7.2: duplicata absorvida por outro
  archived_at  TEXT,                       -- sai das novas divisões, permanece no histórico
  deleted_at   TEXT,
  lamport INTEGER NOT NULL DEFAULT 0, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id),
  description  TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other',   -- ver lista fechada abaixo
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency     TEXT NOT NULL,              -- moeda em que se gastou
  fx_rate_ppm  INTEGER NOT NULL,           -- taxa p/ moeda-base × 1e6 (inteiro), fixada no lançamento
  fx_manual    INTEGER NOT NULL DEFAULT 0, -- 1 = taxa digitada pelo usuário (badge na UI)
  fx_as_of     TEXT,                       -- data da cotação usada; != spent_on => badge "cotação de"
  payment_method TEXT NOT NULL DEFAULT 'no_fx',  -- ver §8.1
  iof_ppm      INTEGER NOT NULL DEFAULT 0, -- alíquota × 1e6, CONGELADA no lançamento
  spent_on     TEXT NOT NULL,
  paid_by      TEXT NOT NULL REFERENCES participants(id),   -- um pagador (ver §2, cortes)
  split_type   TEXT NOT NULL CHECK (split_type IN ('equal','exact')),
  note         TEXT,
  created_by   TEXT NOT NULL,
  deleted_at   TEXT,
  lamport INTEGER NOT NULL DEFAULT 0, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- quem deve quanto. Σ computed_cents DEVE ser igual a expenses.amount_cents, sempre.
CREATE TABLE expense_shares (
  expense_id     TEXT NOT NULL REFERENCES expenses(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  input_cents    INTEGER NOT NULL DEFAULT 0,  -- usado só em split_type='exact'
  computed_cents INTEGER NOT NULL,
  PRIMARY KEY (expense_id, participant_id)
);

CREATE TABLE settlements (
  id      TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id),
  from_id TEXT NOT NULL REFERENCES participants(id),
  to_id   TEXT NOT NULL REFERENCES participants(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL, fx_rate_ppm INTEGER NOT NULL,
  settled_on TEXT NOT NULL, note TEXT, deleted_at TEXT,
  lamport INTEGER NOT NULL DEFAULT 0, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (from_id <> to_id)
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expenses(id),
  local_uri TEXT NOT NULL, remote_url TEXT, bytes INTEGER, uploaded_at TEXT
);

CREATE TABLE fx_rates (            -- cache de cotação
  base TEXT NOT NULL, quote TEXT NOT NULL, as_of TEXT NOT NULL,
  rate_ppm INTEGER NOT NULL, PRIMARY KEY (base, quote, as_of)
);

CREATE TABLE ops_outbox (
  id TEXT PRIMARY KEY, trip_id TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,                -- upsert | delete
  payload TEXT NOT NULL,             -- JSON
  lamport INTEGER NOT NULL, actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);

CREATE TABLE sync_state (trip_id TEXT PRIMARY KEY, cursor TEXT, last_pull_at TEXT);

-- uma conta não pode estar vinculada a dois participantes vivos da mesma viagem
CREATE UNIQUE INDEX uq_participant_user ON participants(trip_id, user_id)
  WHERE user_id IS NOT NULL AND merged_into IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_expenses_trip_date ON expenses(trip_id, spent_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_shares_participant ON expense_shares(participant_id);
CREATE INDEX idx_settlements_trip   ON settlements(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_outbox_created     ON ops_outbox(created_at);
```

### 5.2 Formas de pagamento (lista fechada)

`credit_card` (cartão de crédito internacional) · `debit_card` (débito ou pré-pago
internacional) · `cash_fx` (espécie comprada em casa de câmbio) · `global_account`
(Wise, Nomad e afins, para gastos) · `no_fx` (pago em reais, ou por quem mora fora — sem
operação de câmbio brasileira).

### 5.3 Categorias (lista fechada)

`domain/categories.ts`, cada uma com ícone e cor própria — são as que aparecem numa viagem real:

`restaurant` (restaurante/bar) · `groceries` (mercado) · `lodging` (hotel/Airbnb) ·
`transport` (táxi/Uber/metrô/trem) · `flight` (passagem aérea) · `car` (aluguel de carro,
gasolina, pedágio, estacionamento) · `activity` (passeio/ingresso) · `shopping` ·
`fees` (bagagem, seguro, visto, taxa de câmbio) · `other`

Categoria é opcional na hora de lançar: o default é `other` e a UI **não** pode obrigar a
escolher. Categorizar é para o relatório do fim, não para atrapalhar quem está com o cartão
na mão no caixa do restaurante.

### 5.4 Postgres (Supabase)

Mesmas tabelas, mais:

- `trip_members (trip_id, user_id, role, joined_at)`, `role ∈ {owner, editor}`.
- `trip_invites (token, trip_id, expires_at, max_uses, uses)` — token de 32 bytes aleatórios.
- `server_seq BIGSERIAL` em cada tabela sincronizada → cursor do *pull* incremental.

**RLS obrigatória em todas as tabelas** (nega por padrão):
`EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = <t>.trip_id AND m.user_id = auth.uid())`.
Bucket de recibos privado, path `trips/{trip_id}/{expense_id}/{uuid}`, mesma política.
**Teste obrigatório:** usuário B não consegue ler nada da viagem do usuário A.

---

## 6. Dinheiro

- `Money = { cents: number; currency: CurrencyCode }`, `cents` inteiro (negativo em saldos).
- Suportar expoentes ≠ 2: JPY/KRW (0 casas), BHD/KWD/TND (3). Tabela `CURRENCY_EXPONENT` em
  `domain/money.ts`; formatação por `Intl.NumberFormat`. Numa viagem à Ásia isso aparece no dia 1.
- Parsing aceita `1.234,56`, `1,234.56`, `1234,5`, `1234` — normalizar pelo locale e pelo
  expoente da moeda. Entrada com mais casas do que a moeda permite → **erro de campo**,
  nunca arredondamento silencioso.
- Operações em `Money`: `add`, `sub`, `negate`, `allocate`, `convert`. Não existe multiplicação
  por decimal fora de `convert`.

### `allocate(totalCents, weights[]) → cents[]`

Algoritmo determinístico (*largest remainder*):

1. `exact_i = total × w_i / Σw`, `base_i = floor(exact_i)`.
2. `resto = total − Σ base_i` (0 ≤ resto < n).
3. Distribuir 1 centavo aos `resto` participantes de maior parte fracionária;
   **empate resolvido pelo `participant_id` em ordem lexicográfica**.
4. Invariante testado: `Σ resultado === totalCents` para qualquer entrada — inclusive n=1,
   total negativo, pesos zerados e pesos enormes.

O passo 3 não é firula: é o que faz o celular da Ana e o do Bruno chegarem ao mesmo centavo
sem se falarem.

---

## 7. Participantes e divisão

| Modo | Entrada | Validação |
|---|---|---|
| `equal` | subconjunto de participantes (default: todos os não arquivados) | ≥ 1 participante; usa `allocate` com pesos 1 |
| `exact` | centavos por pessoa | soma **exatamente** igual ao total. A UI mostra "faltam R$ 3,40" / "sobram R$ 1,00" em tempo real e **bloqueia o salvar** até fechar |

Casos que precisam funcionar:

- O pagador pode não estar na divisão (paguei o táxi que só os outros pegaram).
- Uma pessoa pode estar na divisão com valor 0 em `exact`.
- Participante arquivado não aparece em novas divisões, mas continua nas antigas e no saldo.

### 7.1 Quem entra na divisão (subgrupos)

**Premissa de produto: o grupo se separa o tempo todo.** Metade foi ao museu, três foram jantar,
duas dividiram um quarto. Dividir entre um subconjunto não é caso de exceção — é o dia a dia da
viagem. Por isso o seletor "dividir entre" é elemento de primeira classe da tela de despesa,
não um menu escondido.

Requisitos:

- Lista de participantes com *checkbox*, todos marcados por padrão, mais os atalhos
  **"Todos"** e **"Só eu"**.
- O contador some junto do valor por pessoa em tempo real: *"4 de 6 · R$ 41,25 cada"*.
- **Subgrupos salvos.** Ao salvar uma despesa com um subconjunto, o app guarda essa combinação
  em `trip_subgroups (id, trip_id, participant_ids, label, last_used_at)`. Nas próximas
  despesas, as 3 combinações mais recentes aparecem como chips no topo do seletor
  (*"Ana, Bruno, Carla"*), com opção de dar um nome (*"turma do jantar"*).
  Sem isso, remarcar as mesmas 4 pessoas em 15 despesas seguidas é o que faz alguém desistir
  do app no terceiro dia de viagem.
- O último subgrupo usado **não** vira o default da próxima despesa — o default é sempre
  "todos". Um default grudento erra silenciosamente e corrompe o saldo; o atalho explícito
  custa um toque e não erra.

### 7.2 Convite e vinculação (fantasma → conta)

Ao criar a viagem, você cadastra todo mundo só pelo nome. Cada nome vira um participante
**fantasma** (`user_id IS NULL`) — já dá para lançar despesas em nome dele imediatamente,
sem esperar ninguém instalar nada. O convite é um segundo passo, opcional e assíncrono.

**O problema que isso cria** (e que precisa estar resolvido no código, não na cabeça do
usuário): a Ana já tem 12 despesas ligadas ao fantasma "Ana" quando finalmente aceita o
convite. Se aceitar criar um participante novo, a viagem passa a ter duas Anas, e o saldo da
verdadeira fica errado — que é a pior falha possível neste app.

Regras:

1. **Convite direcionado (preferido).** O link é gerado *a partir de um participante*:
   `trip_invites.participant_id` aponta para o fantasma. Quem aceita é vinculado àquele
   participante — `participants.user_id = auth.uid()` — e herda todo o histórico. Nenhuma
   linha nova é criada.
2. **Convite genérico** (link/QR da viagem, o caso da mesa do restaurante). Ao entrar, o app
   **obriga** a escolher: *"Quem é você?"*, listando os fantasmas ainda não vinculados, com
   a opção "sou novo aqui". Não existe entrada silenciosa.
3. **Guarda-corpo:** índice único impede o mesmo `user_id` em dois participantes vivos da
   mesma viagem. A tentativa falha com mensagem clara, não com registro duplicado.
4. **Mesclar duplicatas** (`mergeParticipants(loser, winner)`), para quando alguém escapou
   pelas regras acima: reatribui `expense_shares`, `expenses.paid_by` e `settlements` do
   perdedor para o vencedor, grava `merged_into` no perdedor e marca seu `deleted_at`.
   É uma Op sincronizável como qualquer outra, aplicada **em transação única**. Se os dois
   participarem da mesma despesa, as partes são **somadas** (nunca duplicadas nem descartadas).
   `Σ saldos = 0` continua valendo depois da mesclagem — isso é um teste, não uma esperança.
5. Convite expira em 7 dias, é revogável e tem limite de usos (§12).

---

## 8. Câmbio

- Cada despesa guarda `fx_rate_ppm`, a taxa **da moeda da despesa para a moeda-base da viagem**,
  **fixada no momento do lançamento**. Nunca recalcular retroativamente.
- Fonte: API pública de cotação (`open.er-api.com` ou equivalente), cache diário em `fx_rates`.
  Ao abrir a viagem com rede, pré-carregar as cotações das moedas em uso — o app precisa
  funcionar depois, no metrô de Tóquio, sem sinal.
- Sem rede e sem cache: campo de taxa editável, despesa marcada com badge "taxa manual"
  (`fx_manual = 1`), e um aviso não-bloqueante para revisar depois.
- A taxa é **sempre editável** no detalhe da despesa.
- **A cotação é a do dia do gasto, não a de hoje.** Ao lançar hoje o jantar de anteontem, o app
  procura a cotação de anteontem; sem ela, cai na mais recente **anterior** e marca a despesa
  com "cotação de 14/03". Nunca usa cotação posterior ao gasto — seria adivinhar o passado com
  informação do futuro. (`selectRateForDate`, testado.)

### 8.1 IOF

Toda compra em moeda estrangeira feita por um brasileiro passa por uma operação de câmbio, e o
IOF entra aí. Ignorar isso faz o pagador ser reembolsado por menos do que a fatura dele vai
cobrar — 3,5% de erro sistemático a favor de quem não pagou.

- Alíquota guardada em `iof_ppm` (3,5% = 35_000) e **congelada no lançamento**, exatamente como
  o câmbio: o IOF muda por decreto, e uma viagem fechada não pode mudar de valor sozinha.
- Padrões sugeridos por forma de pagamento (§5.2), **todos editáveis**: 3,5% para cartão de
  crédito, débito, pré-pago, espécie e conta global para gastos; 0 para `no_fx` e para qualquer
  despesa na própria moeda-base. A tabela é palpite de tela, com a data da conferência ao lado —
  não é fonte da verdade fiscal.
- **O IOF entra no rateio**, na mesma proporção do consumo: ele é parte do que o pagador
  desembolsou de verdade. É o padrão; um dia isso pode virar opção por viagem.
- A conta é feita numa multiplicação só (câmbio × IOF, um arredondamento). Somar o imposto
  depois da conversão cria centavo do nada.
- A tela mostra a decomposição, sempre: `¥12.400 = R$ 458,80 + IOF R$ 16,06 = R$ 474,86`.
- **O valor continua sendo estimativa até a fatura chegar** — o cartão fecha o câmbio na data de
  processamento, com spread próprio. Por isso a taxa é editável depois, e por isso a despesa
  guarda `fx_as_of`.
- `convert`: `baseCents = round(cents × rate_ppm / 1_000_000)` ajustando o expoente entre moedas
  de casas diferentes; arredondamento *half away from zero*.

---

## 9. Saldos e acerto

Para cada participante `p`, na moeda-base:

```
pago(p)  = Σ despesas onde paid_by = p (convertidas) + Σ settlements onde from_id = p
deve(p)  = Σ partes de p em moeda-base            + Σ settlements onde to_id = p
saldo(p) = pago(p) − deve(p)
```

**Como converter as partes (isto não é detalhe):** converter a parte de cada pessoa
individualmente QUEBRA o invariante. O pagador é creditado por `converter(total)`, enquanto os
devedores são debitados por `Σ converter(parte_i)` — e as duas contas diferem por centavos de
arredondamento. O certo é converter o **total** uma vez e **reparticionar** esse total já
convertido entre as pessoas, usando as partes originais como peso (`allocate`).

Exemplo real, coberto por teste de regressão: ¥100 a 0,0375, divididos entre 3. Parte a parte dá
128 + 124 + 124 = 376; o total convertido é 375. Um centavo nascido do nada, que desequilibra o
grupo e ninguém consegue explicar no fim da viagem.

`saldo > 0` → tem a receber. `< 0` → deve. **Invariante: `Σ saldo(p) = 0` exatamente.**
Se der ≠ 0 (só por bug de arredondamento em conversão), o app **não disfarça**: loga em Sentry
e mostra uma linha "diferença de arredondamento" ao usuário. Mentir sobre dinheiro entre amigos
é pior que mostrar um resíduo de 1 centavo.

### Acerto de contas

**Simplificado (padrão)** — minimiza transferências:

```
devedores = [saldo < 0] ordenados por |saldo| desc
credores  = [saldo > 0] ordenados por saldo desc
enquanto houver ambos:
  v = min(|topo devedores|, topo credores)
  emitir transferência devedor → credor no valor v
  abater v de ambos, remover quem zerou
```

≤ n−1 transferências. Não é o ótimo global (é NP-difícil) e isso é aceitável — documentar no
código. Empates ordenados por `participant_id` para ser determinístico.

**Cuidado com a promessa na tela:** por ser heurística, existem casos em que este modo gera
*mais* transferências que o de dívidas reais (há um contraexemplo com 6 pessoas nos testes:
5 contra 4). A UI pode chamá-lo de "simplificado", mas **não** pode afirmar que ele sempre
reduz o número de pagamentos.

**Dívidas reais** (toggle) — mantém os pares credor/devedor derivados das despesas, sem
redirecionar pagamento entre pessoas que não interagiram.

Marcar como pago cria um `settlement`. Nunca apaga despesa.

### 9.1 Em que moeda pagar

Cada transferência do fechamento pode ser quitada na **moeda-base** (o caso normal no Brasil:
Pix em reais) ou em **qualquer moeda da viagem** — metade dos acertos acontece ainda na viagem,
em dinheiro, na moeda do lugar.

`paymentOptions()` devolve a moeda-base primeiro e depois as alternativas, cada uma com a taxa
que deve ser gravada no acerto. **Atenção ao resíduo:** pagar R$ 1.902,40 em ienes dá ¥51.416,
que de volta a reais são R$ 1.902,39 — um centavo, inerente a quitar numa moeda de granularidade
mais grossa. O app mostra o resto em vez de fingir que zerou (§9), e o saldo restante fica
visível para quem quiser acertar.

### 9.2 Pix

Cada participante pode cadastrar **uma chave Pix** (CPF, CNPJ, e-mail, telefone ou aleatória).
CPF e CNPJ são validados pelos dígitos verificadores no cadastro — chave errada, sem isso, só
aparece na hora de pagar, quando o grupo já se separou.

No fechamento, cada transferência em reais ganha um **"copia e cola"** com o valor já embutido,
mais o QR code equivalente. Ninguém digita R$ 1.902,40 errado na pressa.

- O BR Code é montado **no aparelho**, pelo padrão EMV do Banco Central, com CRC-16/CCITT-FALSE.
  Sem API, sem intermediário, sem rede: dá para fechar as contas no aeroporto, sem sinal.
- Pix é só em BRL. Em transferência de outra moeda, o app oferece a chave para copiar, mas não
  gera BR Code.
- A chave aparece **mascarada** na lista do grupo (`***.444.777-**`), com a íntegra só no momento
  de copiar.
- O app **não movimenta dinheiro** e não confirma pagamento: "marcar como pago" é declaração de
  quem pagou, não integração bancária. A tela precisa deixar isso claro.

---

## 10. Sincronização e conflito

- **Relógio de Lamport** por dispositivo: `lamport = max(local, recebido) + 1`.
  Não usar o relógio do celular para ordenar — o do seu amigo pode estar errado, e no exterior
  o fuso muda no meio da viagem.
- **Resolução:** last-writer-wins por entidade comparando `(lamport, actor_id)`, `actor_id`
  desempatando lexicograficamente. Garante que todos os dispositivos convergem para o mesmo
  estado sem coordenação.
- **Exclusão:** tombstone. Edição com lamport maior que a exclusão **ressuscita** o registro —
  perder um gasto é pior que ver um gasto que alguém tentou apagar. Documentar.
- **Shares:** substituição atômica do conjunto inteiro junto com a despesa pai. Nunca merge
  linha a linha — produziria uma despesa cujas partes não somam o total.
- **Pull:** `WHERE trip_id = ? AND server_seq > cursor ORDER BY server_seq`, aplicado em
  transação, cursor avançado no fim. Realtime do Supabase para o caso online.
- **Push:** drenar `ops_outbox` em ordem de `created_at`; idempotente pelo `id`
  (`ON CONFLICT (id) DO NOTHING`).
- **Retry:** exponencial 1s→2s→…→5min com jitter. Após 10 falhas, banner "não foi possível
  sincronizar" com "tentar agora" e "ver detalhes".
- O outbox mora no SQLite, não em memória: matar o app no meio do envio não perde nem duplica op.

---

## 11. Telas

Toda tela precisa dos **quatro estados**: carregando (skeleton, não spinner central), vazio
(com ação primária), erro (com retry) e conteúdo.

1. **Entrada.** E-mail → magic link. Botão "usar sem conta" cria viagem só local, com aviso
   claro de que não sincroniza.
2. **Home — Minhas viagens.** Cards com nome, período, seu saldo (verde/vermelho), avatares.
   Ativas e arquivadas. FAB "Nova viagem".
3. **Nova viagem.** Nome, moeda-base (default = locale), datas, cor, participantes
   (nome livre, sem exigir conta).
4. **Viagem — Despesas.** Lista por dia com cabeçalho sticky; cada linha: categoria, descrição,
   "Ana pagou ¥ 3.200", e à direita o seu impacto ("você deve R$ 42,10"). Busca e filtro.
5. **Nova despesa — a tela mais importante.** Teclado numérico grande já focado:
   valor → descrição → quem pagou (default: você) → dividir entre (default: todos, igual) →
   salvar. Trocar moeda inline; "valor exato" atrás de um seletor, não à frente.
6. **Detalhe da despesa.** Quem pagou, quem deve quanto, taxa de câmbio usada (editável, com
   badge se manual), recibo, excluir com undo de 5s.
7. **Saldos.** Barra por pessoa, total da viagem, média por pessoa, "você" destacado.
8. **Fechamento da viagem** — a tela que justifica o app existir. Três blocos:
   **(a) Resumo:** total gasto na viagem, gasto por pessoa, quebra por categoria
   (hotel, restaurante, transporte…) e por moeda, com a taxa usada em cada conversão.
   **(b) Quem paga a quem:** a lista final de transferências — *"Ana paga R$ 87,30 a Bruno"* —
   com toggle simplificado/dívidas reais (§9) e "marcar como pago" por linha.
   **(c) Encerrar:** disponível quando todo mundo está zerado; arquiva a viagem e mantém tudo
   consultável. Se ainda houver saldo aberto, o botão explica exatamente o que falta em vez de
   ficar apenas desabilitado.
   O resumo é compartilhável como texto e imagem (é o que vai para o grupo do WhatsApp) e
   exportável em CSV.
   **(d) Dossiê em PDF:** o documento que sobra da viagem — total, gasto por categoria, por
   moeda, por pessoa (pagou / consumiu / acertos / saldo), a lista completa de despesas com o
   valor original ao lado do convertido, os pagamentos registrados e o que ainda falta. Gerado
   **no aparelho**, sem servidor, porque a viagem costuma ser fechada no voo de volta. O
   documento carrega no rodapé a própria conferência: se as somas por categoria, por moeda e
   por pessoa não fecharem com o total, ele diz isso em vez de parecer correto.
9. **Participantes.** Adicionar, renomear, arquivar. **Remover só se saldo zero e sem despesas** —
   caso contrário, arquivar. Isso é o que impede corromper o saldo do grupo inteiro.
10. **Convite.** `rachapila://join/{token}` + link universal + **QR code** — o caso real é a mesa
    do restaurante, não o e-mail.
11. **Ajustes.** Idioma, tema, moeda padrão, exportar CSV, apagar dados locais, diagnóstico.

### Design system

Tokens em `src/ui/tokens.ts`: cores **semânticas** (`bg`, `bgElevated`, `text`, `textMuted`,
`positive`, `negative`, `accent`), espaçamento base 4, raios, tipografia. Claro e escuro
derivados dos mesmos tokens. Componentes: `Text`, `Button`, `Input`, `MoneyInput`, `Money`,
`Avatar`, `Card`, `Sheet`, `ListRow`, `SegmentedControl`, `EmptyState`, `Skeleton`, `Snackbar`,
`Chip`. Toque mínimo 44×44pt, háptico em confirmações, e valores monetários em
`fontVariant: ['tabular-nums']` para os números não dançarem na lista.

### Notificações e links

`expo-notifications`: push quando alguém lança despesa que te afeta, quando te convidam e quando
marcam acerto com você; silenciável por viagem. **Pedir permissão só depois da primeira despesa
criada**, nunca na abertura. Deep links: `/join/{token}`, `/trip/{id}`, `/trip/{id}/expense/{id}` —
cold start com link deve chegar ao destino certo depois do login.

---

## 12. Segurança, privacidade e resiliência

- Sessão no **SecureStore** (Keychain/Keystore), nunca em AsyncStorage.
- **Chave Pix é dado pessoal** (muitas vezes o CPF). Visível apenas para participantes da mesma
  viagem, mascarada por padrão na lista, nunca em log, nunca no Sentry, e removida junto com a
  conta. Sai também de qualquer exportação CSV compartilhada.
- RLS em tudo; validar no servidor o mesmo que o cliente valida.
- Convite: token de alta entropia, expira em 7 dias, revogável, limite de usos.
- Recibos em bucket privado com URL assinada de curta duração.
- Sentry com `sendDefaultPii: false` e scrubbing das descrições de despesa.
- Error boundary por rota; log estruturado local (ring buffer de 500 entradas) exportável em
  Ajustes → "Enviar diagnóstico". Sem isso, um bug de saldo relatado por amigo é indepurável.
- Migrações numeradas e testadas: **um teste roda todas as migrações num banco populado e
  verifica os invariantes de saldo no fim**.

### i18n e acessibilidade

pt-BR (padrão) e en, zero string literal na UI. Moeda/data/plural pelo `Intl` com o locale ativo.
`accessibilityLabel` e `accessibilityRole` em todo elemento interativo; VoiceOver e TalkBack
navegam tudo; layout não quebra em `fontScale` 1.5; contraste AA; respeitar
`prefers-reduced-motion`.

---

## 13. Testes

**Portão: `npm run verify` = typecheck + lint + testes. Nada é "pronto" sem ele verde.**

### `domain/` — cobertura ≥ 90%

- `allocate`, property-based (fast-check): para qualquer total e quaisquer pesos,
  `Σ resultado === total`, sem partes negativas quando o total é positivo.
- R$ 100,00 igual entre 3 → `[3334, 3333, 3333]`; **a mesma entrada em qualquer ordem de
  participantes produz a mesma atribuição**.
- `exact` com soma divergente → erro de validação, nunca salva.
- Despesa cujo pagador não está na divisão → saldos corretos.
- JPY (0 casas) e KWD (3 casas) em cálculo e formatação.
- Viagem multi-moeda (BRL base, gastos em JPY, EUR, USD) → `Σ saldos === 0`.
- Simplificação com 5 pessoas → ≤ 4 transferências, saldos preservados.
- Settlement parcial mantém o resto devido.
- **Subgrupo:** jantar dividido entre 4 de 6 participantes → os 2 ausentes não são afetados
  em nada, e `Σ saldos === 0`.
- **Mesclagem de participante:** duas "Anas" com despesas, acertos e uma despesa em comum →
  após `mergeParticipants`, o saldo da Ana resultante é a soma exata dos dois, nada é
  duplicado nem perdido, e `Σ saldos === 0`.
- **Vinculação:** aceitar convite direcionado herda as 12 despesas do fantasma; aceitar sem
  escolher fantasma não é possível.
- Cenário de fechamento completo: 6 pessoas, 20 despesas em 3 moedas, subgrupos variados,
  2 acertos parciais → soma das transferências sugeridas quita todos os saldos exatamente.
- **IOF:** ¥12.400 a 0,037 com 3,5% → R$ 474,86, dos quais R$ 16,06 de imposto; a decomposição
  fecha (`líquido + IOF = total`) para qualquer valor e alíquota; o IOF é rateado na mesma
  proporção do consumo; despesa sem IOF se comporta como antes.
- **Cotação do dia:** usa a do dia do gasto; sem ela, a anterior mais recente marcada como
  `stale`; nunca uma posterior.
- **Pix:** CRC bate com o vetor canônico `123456789 → 0x29B1`; CPF e CNPJ validados por dígito
  verificador; BR Code gerado tem CRC válido, valor com duas casas, moeda 986, país BR, acento
  removido do nome e da cidade, corte nos limites do padrão, e adulteração é detectada.
- **Moeda do acerto:** as opções trazem a base primeiro; a taxa devolvida fecha o saldo ao gravar
  o acerto, com o resíduo de arredondamento visível em vez de escondido.
- Property-based geral: para qualquer viagem gerada aleatoriamente (com IOF sorteado),
  `Σ saldos === 0`.

### `sync/`

- Duas réplicas aplicando ops fora de ordem convergem ao estado idêntico.
- Edição concorrente da mesma despesa em dois dispositivos → mesmo vencedor nos dois.
- Delete vs. edição concorrente → comportamento da §10 em ambos os lados.
- Kill do app no meio do envio → nenhuma op perdida, nenhuma duplicada.
- RLS: usuário fora do grupo não lê nada.

### E2E (Maestro)

1. **Viagem completa:** criar viagem em EUR → 4 participantes por nome → jantar dividido entre
   3 deles → hotel entre todos → táxi pago por outra pessoa → conferir saldos → fechamento →
   marcar transferências como pagas → tudo zerado → encerrar viagem.
2. **Modo avião:** criar despesa offline, matar o app, reabrir, voltar online, confirmar sync.
3. **Convite e vinculação:** dispositivo B entra pelo link, escolhe "sou a Ana", e vê as
   despesas que já estavam lançadas em nome dela — sem virar uma segunda Ana.
4. **Multi-moeda:** gasto em JPY numa viagem com base BRL, taxa manual offline, revisão depois.

---

## 14. Ordem de implementação

Cada fase termina com `npm run verify` verde e um commit. Não avance com teste vermelho.

| Fase | Entrega | Critério de aceite |
|---|---|---|
| **0** | Expo + TS strict + lint + Vitest + estrutura + CI | `verify` roda e passa em CI |
| **1** | `domain/` completo: money, allocate, equal/exact, fx, balance, settle — **puro, sem UI** | Toda a §13 `domain/` verde. **É a fase mais importante do projeto**: acerte aqui e o resto é tela |
| **2** | SQLite + Drizzle + migrações + repositórios + comandos com outbox | Teste de migração e de atomicidade (estado + op na mesma transação) |
| **3** | Design system + navegação + viagens/despesas/saldos + seletor de subgrupo e subgrupos salvos, **100% offline, sem backend** | E2E #1 passa; app inteiro usável sem rede |
| **4** | Multi-moeda na UI: seletor, cotação **do dia do gasto**, cache, taxa manual, badge, forma de pagamento e IOF com decomposição visível | E2E #4 passa; a decomposição confere com a fatura |
| **5** | Fechamento: resumo por categoria/moeda, quem paga a quem (dois modos), **escolha da moeda do pagamento**, **chave Pix e copia e cola com QR**, settlements, compartilhar, CSV, encerrar | E2E #1 fecha em saldo zero e a viagem encerra; o BR Code gerado é aceito por um app de banco real |
| **6** | Supabase: auth por magic link, schema, RLS, sync worker, realtime, convites direcionados, QR, deep links, **vinculação e mesclagem de participante** | E2E #2 e #3 passam; teste de RLS negando acesso cruzado; teste de mesclagem preservando saldos |
| **7** | Recibos + Storage, notificações, exportar CSV, i18n, a11y, tema escuro, polimento | Upload retomável após queda de rede; `fontScale` 1.5 sem quebra |
| **8** | Sentry, diagnóstico, EAS Build, ícone, splash, distribuição | APK instalável + build no TestFlight |

Um app útil já existe no fim da Fase 3 — dá para usar numa viagem sozinho antes de o sync existir.

---

## 15. Distribuição (uso privado)

- **Android:** EAS Build perfil `preview` → APK, distribuído por link direto. Grátis, sem
  burocracia. Seus amigos instalam habilitando "fontes desconhecidas".
- **iPhone:** **exige a Apple Developer Program, US$ 99/ano.** Não existe caminho gratuito
  razoável — build sideloaded sem conta paga expira em 7 dias. Com a conta: TestFlight,
  até 100 testadores internos, build válido por 90 dias. Se não quiser pagar, o app funciona
  em Android e no seu iPhone só via build de desenvolvimento local.
- Sem publicação em loja, ficam **fora**: Sign in with Apple, política de privacidade,
  tela de exclusão de conta, screenshots, classificação etária, privacy manifests.
  Se um dia decidir publicar, esses são os itens a acrescentar — nada no código muda.
- `expo-updates` para corrigir JS sem novo build; incrementar `runtimeVersion` em mudança nativa.
- Permissões com justificativa em pt-BR e en (câmera → "para fotografar recibos").

---

## 16. Definition of Done

- [ ] `npm run verify` verde; cobertura de `domain/` ≥ 90%.
- [ ] Todos os fluxos da §11 funcionam **em modo avião**.
- [ ] `Σ saldos = 0` verificado por teste property-based em viagens aleatórias multi-moeda.
- [ ] Dois dispositivos convergem ao mesmo estado após edição offline simultânea.
- [ ] RLS testada: usuário fora do grupo não lê nada.
- [ ] Nenhum `any`, nenhum `float` em caminho monetário, nenhuma cor fora dos tokens.
- [ ] App abre em < 2s em Android mediano; lista de 500 despesas rola a 60fps.
- [ ] pt-BR e en completos; VoiceOver e TalkBack navegam todas as telas.
- [ ] APK e build TestFlight gerados e instalados.
- [ ] `docs/DECISIONS.md` registra toda decisão tomada fora deste spec.

---

## 17. Armadilhas conhecidas (leia antes de codar)

1. **Não recalcule câmbio retroativamente.** A taxa é fixada no lançamento. Recalcular faz o
   saldo de uma viagem encerrada mudar sozinho — é o bug que mais destrói a confiança nesse
   tipo de app, e num app multi-moeda ele é fácil de introduzir sem perceber.
2. **Não use `float` "só no cálculo intermediário".** `0.1 + 0.2` já erra; três pessoas e uma
   conversão de moeda e a soma não fecha.
3. **Não permita remover participante com histórico.** Arquive.
4. **Não mostre spinner de salvamento.** Salvar é local.
5. **Não faça merge parcial de shares.** Substitua o conjunto inteiro.
6. **Não peça login antes de entregar valor.** Deixe criar a primeira viagem local.
7. **Não ordene ops pelo relógio do dispositivo.** Use Lamport.
8. **Não assuma 2 casas decimais.** JPY não tem centavo.
9. **Não deixe o convite criar um participante novo em silêncio.** Duas Anas na mesma viagem
   é a falha mais destrutiva possível aqui: o saldo fica errado e ninguém percebe até a hora
   de acertar as contas. Escolher "quem é você" é obrigatório (§7.2).
10. **Não faça o último subgrupo virar o default.** O default é sempre "todos"; o atalho é
    explícito. Default grudento erra calado.
11. **Não recalcule o IOF depois.** Mesma armadilha do câmbio: a alíquota muda por decreto, e
    recalcular reescreve o passado de uma viagem já fechada.
12. **Não some o IOF depois de converter.** Câmbio e imposto na mesma conta, um arredondamento só.
13. **Não prometa que o app confirma o pagamento.** Ele gera o Pix e registra a declaração de
    quem pagou; não fala com banco nenhum e não sabe se o dinheiro caiu.
