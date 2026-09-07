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

## 2026-09-07 — IOF entra no rateio, e fica congelado na despesa

Uma compra em moeda estrangeira feita por um brasileiro passa por operação de câmbio, e o IOF
incide sobre ela. Se o app converter só pelo câmbio, o pagador é reembolsado por menos do que a
fatura dele vai cobrar — um erro sistemático de 3,5% a favor de quem não pagou.

Decisões:

1. O IOF **entra no total da despesa antes do rateio**, e portanto é dividido na mesma proporção
   do consumo. Alternativa considerada e recusada por ora: deixar o imposto só com o pagador —
   defensável quando alguém teria pago em dinheiro sem IOF, mas complica a conta e some da vista.
   Se virar reclamação, vira opção por viagem.
2. A alíquota é **congelada em `iof_ppm` no lançamento**, como o câmbio. O IOF muda por decreto
   (mudou em 2025) e uma viagem encerrada não pode mudar de valor sozinha.
3. Os padrões (3,5% para cartão de crédito, débito, pré-pago, espécie e conta global de gastos)
   são palpite de tela, **sempre editáveis**, com a data da conferência ao lado. O app não é
   fonte da verdade fiscal.
4. Câmbio e imposto são uma multiplicação só, com um arredondamento. Somar o imposto depois da
   conversão criaria centavo do nada e quebraria `Σ saldos = 0`.
5. O valor segue sendo **estimativa até a fatura chegar** — o cartão fecha o câmbio na data de
   processamento, com spread próprio. Por isso a taxa continua editável depois.

## 2026-09-07 — Pix gerado offline, sem intermediário

O "copia e cola" é montado no aparelho pelo padrão EMV do Banco Central (TLV + CRC-16/CCITT-FALSE).
Nenhuma API, nenhum intermediário, nenhuma dependência de rede: o fechamento acontece no
aeroporto, na fila do embarque, sem sinal.

CPF e CNPJ são validados por dígito verificador no cadastro, porque uma chave errada só se
manifesta na hora de pagar — quando o grupo já se separou. A chave aparece mascarada na lista do
grupo; a íntegra só no momento de copiar.

Limite explícito: o app **não movimenta dinheiro e não confirma pagamento**. "Marcar como pago" é
declaração de quem pagou, não integração bancária. A tela precisa dizer isso.

## 2026-09-07 — Acerto em outra moeda deixa resíduo, e ele é mostrado

Pagar R$ 1.902,40 em ienes dá ¥51.416, que de volta a reais são R$ 1.902,39. O centavo é inerente
a quitar numa moeda de granularidade mais grossa — não é bug e não dá para eliminar.

O app grava o acerto pelo valor realmente entregue e deixa o resto aparecer no saldo, em vez de
"ajustar" a diferença em silêncio. Esconder resíduo é como se perde a confiança na conta.

## 2026-09-07 — SQL direto atrás de uma porta, em vez de Drizzle ORM

**Desvio do spec.** A §3 previa Drizzle ORM. Ao montar a Fase 2 ficou claro que ele resolveria
pouco e custaria caro aqui:

- o app precisa de dois drivers (`expo-sqlite` no aparelho, `better-sqlite3` nos testes), e a
  compatibilidade entre a versão do Drizzle e a do SDK do Expo é uma das coisas que mais quebram
  em projeto React Native — sem ganho para consultas simples;
- as migrações precisam rodar dentro do app, e SQL numerado é o formato mais previsível para
  isso: o mesmo texto roda nos dois drivers, sem tradutor no meio;
- as consultas deste app são CRUD e dois joins. O que o Drizzle daria em tipagem, os tipos de
  linha em `repositories.ts` dão de forma explícita.

O que ficou no lugar: `db/driver.ts` (uma interface de seis métodos, com transação por SAVEPOINT
para os comandos poderem se compor), `db/migrations.ts` (SQL numerado, nunca editado depois de
existir) e `db/repositories.ts` (consultas junto dos tipos de linha).

O custo assumido: ler uma linha do SQLite é uma **afirmação** de formato, não uma verificação.
Está marcado no código onde isso acontece. Se as consultas crescerem muito, Drizzle volta à mesa.

## 2026-09-07 — Estado e operação na mesma transação, sempre

Todo comando de escrita grava a mudança e a operação do outbox numa transação só. Sem isso, uma
falha no meio deixaria uma despesa que existe no aparelho e nunca chega aos outros — ou o
contrário. Há teste que sabota a segunda escrita e confirma que nada sobra.

Consequência de projeto: o outbox mora no SQLite, não em memória, e a UI nunca espera a rede
para dar a despesa como salva.
