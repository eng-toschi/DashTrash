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

## 2026-09-07 — Imports sem extensão, para o Metro conseguir resolver

O projeto usava `import ... from './money.js'`, que o Node ESM exige. O Metro, empacotador do
React Native, não faz a reescrita de `.js` para `.ts` e quebraria em todos os arquivos. Os
imports relativos passaram a ser sem extensão (`moduleResolution: "bundler"`), que funciona no
Metro, no Vitest e no TypeScript. O `"type": "module"` saiu do `package.json` pelo mesmo motivo —
`babel.config.js` e `metro.config.js` precisam ser CommonJS.

## 2026-09-07 — "Você" é o aparelho, enquanto não existe login

A Fase 3 não tem contas. Quem cria a viagem entra como participante com `user_id` igual ao
`actor_id` do dispositivo, e `findMe()` acha essa linha. Quando o login chegar (Fase 6),
`linkParticipantToUser` troca esse valor pelo id real — sem migração de dados e sem duplicar
ninguém.

## 2026-09-07 — O convite aparece desabilitado, com o motivo

A tela de participantes mostra que o convite por link e QR chega junto com a sincronização, em
vez de exibir um botão que não faz nada. Prometer o que ainda não existe é pior que mostrar o
limite: quem usa precisa saber que, por ora, a viagem vive só naquele celular.

## 2026-09-07 — Tema segue o sistema, sem seletor no app

Claro e escuro saem dos mesmos tokens semânticos e acompanham a configuração do aparelho. Um
seletor próprio seria mais uma linha em Ajustes para resolver algo que o sistema operacional já
resolve.

## 2026-09-07 — O Hermes não é o Node: `crypto` e `normalize` não existem lá

A primeira execução num aparelho real derrubou o app em `crypto.getRandomValues`. O motor do
React Native não traz o objeto `crypto` global que o Node e o navegador trazem, e os testes
passavam justamente porque rodam no Node.

A varredura que fiz em seguida achou um segundo caso, ainda não disparado: o Hermes também não
implementa `String.prototype.normalize` com decomposição, que era como o BR Code do Pix tirava o
acento do nome. Teria gerado um código que o banco recusa — pior que um crash, porque falha
calado.

Padrão adotado para os dois: **sondar a capacidade uma vez e ter um caminho de reserva**, em vez
de assumir a plataforma. Os ids usam `crypto` quando existe (e o app instala a implementação do
aparelho via `expo-crypto` antes de tudo); sem ela, caem para `Math.random`, o que é aceitável
para identificador local e está marcado como INACEITÁVEL para segredo — token de convite
(Fase 6) precisa de fonte criptográfica de verdade, no servidor.

Lição para as próximas fases: toda API de plataforma usada no domínio precisa de teste que
exercite o caminho sem ela. `Intl` já tinha; `crypto` e `normalize` agora também.

## 2026-09-07 — Toda API de plataforma passa a ter reserva

Três quebras seguidas em aparelho real, todas da mesma família: `crypto` (derrubou na abertura),
`String.normalize` (ia gerar Pix inválido, calado) e `Intl.NumberFormat.formatToParts` (derrubou
a tela de nova despesa). O Hermes implementa um subconjunto do que o Node oferece, e os testes
rodando em Node não veem nada disso.

Regra adotada: **nenhuma chamada a API de plataforma pode derrubar a tela**. Cada uma sonda a
capacidade ou fica dentro de `try/catch`, com um caminho de reserva testado diretamente — não
basta testar o caminho feliz, porque no Node é sempre ele que roda.

Cobertos até aqui: `crypto.getRandomValues`, `String.prototype.normalize`,
`Intl.NumberFormat.formatToParts`, `Intl.NumberFormat` com `style: 'currency'`,
`Intl.NumberFormat.format` com string, e `Intl.DateTimeFormat`.

O custo disso é real e vale registrar: a reserva de formatação mostra o código ISO em vez do
símbolo, e a de aleatoriedade usa `Math.random`. As duas são piores que o caminho principal — e
as duas são muito melhores que uma tela em branco.

## 2026-09-08 — Cotação online sim, IOF online não

Os dois pedidos chegaram juntos, e só um tem resposta honesta.

**Câmbio:** há serviço público confiável, e o app passou a buscar a cotação do dia quando a
moeda muda. A resposta é tratada como dado NÃO confiável — o formato é conferido campo a campo,
e qualquer coisa fora do esperado cai no preenchimento manual. Uma cotação errada gravada numa
despesa é pior que pedir a taxa à mão: ela some dentro de um número plausível e ninguém confere.

**IOF:** não existe fonte pública, oficial e legível por máquina da alíquota vigente. Inventar
uma (raspar uma página, chutar um endpoint) daria um número que pode mudar sem aviso e quebrar
calado — exatamente o tipo de erro que este app não pode ter. Enquanto isso, a alíquota é um
interruptor com percentual editável na tela, padrão 3,5%, congelado na despesa. Quando existir
servidor (Fase 6), ele serve esse número, e aí muda sem depender de atualização do app.

Consequência de projeto: o seletor de forma de pagamento saiu da tela. Hoje cartão, espécie e
conta global pagam a mesma alíquota, então dois controles decidiam a mesma coisa. A coluna
`payment_method` continua no banco para quando voltarem a divergir.
