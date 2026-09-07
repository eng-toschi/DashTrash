# Decisões tomadas fora do spec

Registro exigido pelo spec (§16). Cada entrada diz o que foi decidido, por quê, e o que
mudaria se a decisão fosse revista.

## 2026-09-07 — Fase 1 não depende de React Native

A camada de domínio é pura: dinheiro, divisão, câmbio, saldos e fechamento não importam React,
SQLite nem rede. Por isso o projeto começa como um pacote TypeScript puro, com Vitest e
fast-check, e o Expo entra só na Fase 3, junto com a primeira tela.

Ganho: os testes rodam em menos de um segundo, sem emulador e sem cadeia de build nativa, e a
parte do app onde um erro custa caro fica verificada antes de existir interface.
Se revista: mover `src/domain/` para dentro do app Expo não muda uma linha do código — ele não
tem dependência de plataforma.

## 2026-09-07 — `parseMoneyInput` recebe o locale

O spec (§6) listava os formatos aceitos, mas não resolvia a ambiguidade entre eles. Um teste
mostrou o problema: `10,999` em pt-BR é dez inteiros e 999 milésimos (casas demais para BRL,
portanto erro), enquanto em en-US é 10.999. Adivinhar pelo formato transformava R$ 10,99 em
R$ 10.999,00 silenciosamente.

A função passou a exigir o locale e usa o separador decimal dele (`Intl.NumberFormat`) para
desempatar. Quem chama precisa passar o locale ativo da UI — não há default, de propósito.

## 2026-09-07 — Conversão de moeda reparte o total, não cada parte

Ver §9 do spec, atualizado com o exemplo. Converter parte por parte quebra o invariante
`Σ saldos = 0`. `expenseInBase()` converte o total uma vez e reparticiona com `allocate`.

## 2026-09-07 — O modo simplificado não promete menos transferências

O algoritmo guloso é heurística, não ótimo. Os testes de propriedade acharam um caso com
6 pessoas em que ele gera 5 transferências onde as dívidas reais resolvem em 4. O caso virou
teste fixo. Consequência prática: o texto da tela pode chamar o modo de "simplificado", mas não
pode afirmar que ele sempre reduz o número de pagamentos.

## 2026-09-07 — Formatação monetária via `Intl` com string

`Intl.NumberFormat.format` aceita string desde o Node 20 / iOS 16, mas o `lib.d.ts` do
TypeScript ainda não declara essa sobrecarga — ela é adicionada em `src/types/intl.d.ts`.
Formatar a partir da string decimal exata mantém a promessa de que nenhum valor monetário passa
por float, nem na hora de exibir. Testado com R$ 12.345.678.901.234,56, acima da precisão do
`number`.

## 2026-09-07 — Aritmética em BigInt nas conversões e no rateio

Um gasto em ienes convertido para reais estoura `Number.MAX_SAFE_INTEGER` no produto
intermediário (`centavos × ppm`). `allocate` e `convertCents` fazem a conta em BigInt e só
voltam para `number` no fim, com verificação de faixa segura.
