# Rachei

App de divisão de despesas de viagem para iPhone e Android. Em construção.

- **Spec completa:** [`docs/SPEC-app-divisao-de-despesas.md`](docs/SPEC-app-divisao-de-despesas.md)
- **Decisões fora do spec:** [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Estado

| Fase | O quê | Estado |
|---|---|---|
| 0 | Base do projeto, TypeScript strict, lint, testes | ✅ |
| 1 | `src/domain/` — dinheiro, divisão, câmbio, saldos, fechamento | ✅ |
| 2 | SQLite + Drizzle + outbox | pendente |
| 3 | App Expo: telas, offline completo | pendente |
| 4–8 | Multi-moeda na UI, fechamento, sync, distribuição | pendente |

A Fase 1 é lógica pura e não depende de React Native — o Expo entra na Fase 3
(ver `docs/DECISIONS.md`).

## Rodar

```bash
npm install
npm run verify     # typecheck + lint + testes  <- portão de qualidade
npm test           # só os testes
npm run test:watch
npx vitest run --coverage
```

`npm run verify` precisa estar verde antes de qualquer commit.

## O que já funciona

`src/domain/` está completo e testado (103 testes, cobertura acima de 90%):

- **`money.ts`** — valores sempre inteiros; `allocate` reparte sem perder centavo, com
  desempate determinístico por id; leitura da entrada do usuário sensível ao locale;
  moedas de 0, 2 e 3 casas (JPY, BRL, KWD).
- **`fx.ts`** — conversão em BigInt com arredondamento correto, taxa fixada por despesa.
- **`split.ts`** — divisão igual (inclusive entre um subgrupo) e por valor exato.
- **`balance.ts`** — saldos por pessoa, com `Σ saldos = 0` garantido por construção.
- **`settle.ts`** — fechamento nos dois modos: simplificado e dívidas reais.
