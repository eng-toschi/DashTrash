# RachaPila

App de divisão de despesas de viagem para iPhone e Android. Em construção.

- **Spec completa:** [`docs/SPEC-app-divisao-de-despesas.md`](docs/SPEC-app-divisao-de-despesas.md)
- **Decisões fora do spec:** [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Estado

| Fase | O quê | Estado |
|---|---|---|
| 0 | Base do projeto, TypeScript strict, lint, testes | ✅ |
| 1 | `src/domain/` — dinheiro, divisão, câmbio, saldos, fechamento | ✅ |
| 2 | SQLite, migrações, repositórios e comandos com outbox | ✅ |
| 3 | App Expo: design system e telas, 100% offline | ✅ |
| 4–8 | Multi-moeda na UI, fechamento, sync, distribuição | pendente |

A Fase 1 é lógica pura e não depende de React Native — o Expo entra na Fase 3
(ver `docs/DECISIONS.md`).

## Rodar

```bash
npm install
npm run verify     # typecheck + lint + testes  <- portão de qualidade
npm start          # abre o app no Expo (celular ou emulador)
npm run bundle     # empacota iOS e Android — prova que compila, sem emulador
npx vitest run --coverage
```

`npm run verify` precisa estar verde antes de qualquer commit.

## O que já funciona

`src/domain/` e `src/db/` estão completos e testados (180 testes):

- **`money.ts`** — valores sempre inteiros; `allocate` reparte sem perder centavo, com
  desempate determinístico por id; leitura da entrada do usuário sensível ao locale;
  moedas de 0, 2 e 3 casas (JPY, BRL, KWD).
- **`fx.ts`** — conversão em BigInt com arredondamento correto, taxa fixada por despesa.
- **`split.ts`** — divisão igual (inclusive entre um subgrupo) e por valor exato.
- **`balance.ts`** — saldos por pessoa, com `Σ saldos = 0` garantido por construção.
- **`settle.ts`** — fechamento nos dois modos: simplificado e dívidas reais, e em que moedas
  cada transferência pode ser quitada.
- **`payment.ts`** — formas de pagamento e IOF, com a alíquota congelada na despesa.
- **`pix.ts`** — chave Pix validada e "copia e cola" gerado offline (padrão EMV do Banco Central).
- **`db/`** — migrações numeradas, repositórios que montam o razão da viagem, e a porta de acesso
  ao SQLite (`better-sqlite3` nos testes, `expo-sqlite` no app).
- **`sync/`** — relógio de Lamport e outbox: estado e operação sempre na mesma transação.
- **`commands/`** — criar e editar viagem, participantes, despesas e acertos; vincular convite;
  mesclar duplicatas.

O app em si vive em `app/` (rotas do Expo Router) e `src/ui/` (design system).
As telas desenhadas que serviram de referência estão em `design/`.

**Estado da Fase 3:** o app compila e empacota para iOS e Android, e o fluxo completo
(criar viagem, lançar em três moedas, subgrupo, fechar e zerar) é coberto por teste na
mesma camada que as telas usam. Ele ainda não foi executado num aparelho — falta rodar
`npm start` num celular ou emulador para a validação visual.
