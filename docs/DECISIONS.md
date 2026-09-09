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

## 2026-09-07 — Tema segue o sistema, sem seletor no app — **revogada em 08/09**

Claro e escuro saem dos mesmos tokens semânticos e acompanham a configuração do aparelho. Um
seletor próprio seria mais uma linha em Ajustes para resolver algo que o sistema operacional já
resolve.

Errei o julgamento: o pedido veio no primeiro teste no aparelho ("faltou também a opção de dark
mode"). Ver "Três estados de tema", no fim deste arquivo.

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

## 2026-09-08 — O dossiê é uma função pura, e confere a si mesmo

O PDF do fechamento é o documento que as pessoas guardam e conferem meses depois, quando ninguém
lembra mais do contexto. Se ele discordar do que o app mostrou, a confiança na conta inteira vai
junto.

Por isso ele é montado em duas funções puras — `buildDossier` (números) e `renderDossierHtml`
(documento) — testadas sem abrir o app, inclusive com teste de propriedade sobre viagens
aleatórias. E ele carrega a própria conferência no rodapé: se as somas por categoria, por moeda
ou por pessoa não baterem com o total, o texto diz isso em vez de o papel parecer correto.

Duas armadilhas que já custaram caro em outros pontos e foram cobertas de saída: escapar o que o
usuário digitou (uma viagem chamada "Praia & Cia" quebraria o documento em silêncio) e tirar o
acento do nome do arquivo, senão "Japão" vira "jap-o".

Geração local, via `expo-print`: sem servidor, sem upload, funcionando no voo de volta — que é
onde a viagem costuma ser fechada.

## 2026-09-08 — Três estados de tema, não dois

O seletor tem **automático, claro e escuro** — não um interruptor liga/desliga. Um interruptor de
dois estados obriga quem deixa o celular trocar sozinho ao anoitecer a abrir mão disso para poder
escolher, e é justamente esse o padrão do aparelho.

A preferência fica em `app_settings`, no banco do próprio aparelho, e **não** no estado da viagem:
escolher escuro aqui não pode mudar a tela de mais ninguém quando a sincronização existir.

O botão fica no cabeçalho da home, não escondido em Ajustes — que ainda nem existe. O ícone mostra
o estado atual (sol, lua, círculo meio a meio) e a dica de acessibilidade diz o que o próximo
toque faz, porque um botão que cicla três estados sem dizer o próximo é adivinhação.

## 2026-09-08 — A cor da categoria é informação, não enfeite

O primeiro corte das telas saiu cinza: ladrilho de ícone em `surfaceAlt`, chips iguais, barras do
fechamento todas na cor de destaque. Ficou legível e ilegível ao mesmo tempo — dá para ler cada
linha, mas não dá para varrer a lista e achar "os restaurantes".

Cada categoria tem uma cor (`CATEGORY_COLORS`) e ela aparece nos três lugares em que a categoria
aparece: o ladrilho do ícone na lista, o chip do formulário e a barra do fechamento. A home ganhou
a mesma ideia para pessoas: a barra do card é uma faixa por pagador, na cor da pessoa, que responde
de relance a "quem está bancando a viagem".

O fundo do ladrilho é a **própria cor com alfa** (`withAlpha`), não um segundo hexadecimal por
categoria. Duas tabelas de cor — uma para o claro, outra para o escuro — sairiam de sincronia na
primeira categoria nova; com alfa, o ladrilho se apoia na superfície do tema, seja ela qual for.
O alfa é maior no escuro, onde a mesma camada some no fundo.

## 2026-09-08 — Com fonte própria não existe `fontWeight`

As telas usam Bricolage Grotesque (títulos e números grandes) e Figtree (o resto). Cada peso é uma
**família** carregada por nome — `Figtree_700Bold` —, e pedir `fontWeight: '700'` por cima disso
funciona no iOS e sai errado no Android, que não sintetiza o peso: ou ignora, ou engorda o traço.

Então o `fontWeight` foi eliminado do projeto. Componente próprio recebe `strong`; `TextInput`, que
não passa pelo nosso `Text`, recebe `fontFamily` de `FONT` diretamente. `app/_layout` segura a
splash até as fontes carregarem: sem isso a primeira pintura sai na fonte do sistema e troca na
cara de quem está olhando, o que é mais feio que a espera.

## 2026-09-08 — A escala de texto é transcrita dos artboards, não estimada

Os tamanhos em `Text` saíram de uma varredura dos `design/*.dc.html`, não de palpite. O que os
desenhos usam, e o que virou variante:

| artboard                     | variante   |
| ---------------------------- | ---------- |
| 27–30 px Bricolage 700       | `display`  |
| 19–21 px Bricolage 700       | `headline` |
| 17 px Bricolage 700          | `title`    |
| 15,5 px 650                  | `body`     |
| 14 px 600                    | `label`    |
| 12,5 px 500                  | `caption`  |
| 11–11,5 px 600               | `micro`    |
| 12 px 700, versal, ls 0.08em | `overline` |

Três coisas mudaram de valor nessa conferência, e as três apareciam em toda tela: `body` estava no
peso 500 (o desenho pede 650, e era isso que deixava as listas apagadas), `overline` estava a 11 px
com espaçamento de 1 px (o desenho pede 12 e 0,96) e `label` estava a 13,5 em vez de 14.

Onde o desenho usava dois tamanhos a um ou dois pixels de distância — 27 e 28, 19 e 21 — a variante
ficou com um só. Essa distância não é intenção de design, é ruído de quem desenhou à mão; carregar
as duas só cria a dúvida de qual usar. `RADIUS` e a paleta, conferidos no mesmo passe, já batiam
exatamente com os artboards e não precisaram mudar.

## 2026-09-08 — `Badge` para estado, `Chip` para toque

Os selos dos desenhos ("Em curso", "2 de 4", "IOF 3,5%") têm 11 px e 5 px de respiro — metade do
`Chip`. Usar `Chip` neles, que respeita os 38 px de alvo de toque, enchia a tela de botões falsos:
tudo parecia clicável, nada dizia o que era estado e o que era ação. Daí dois componentes, com a
regra na assinatura — `Badge` não recebe `onPress`.

## 2026-09-08 — A hora é gravada COM o fuso, não em UTC

`spent_at` guarda `2026-03-14T21:04:00+09:00`, não o instante absoluto.

Gravar em UTC seria o reflexo automático, e estaria errado para este app. O
jantar foi às 21h em Tóquio; convertido para UTC e re-exibido no fuso do
aparelho, ele vira 12h quando a pessoa confere a conta de volta no Brasil — e
pior, a despesa pula para outro dia e muda de posição na lista. O que importa
numa conta de viagem é a hora que as pessoas viram no relógio da parede.

Consequência prática: `timeLabel` lê a hora DO TEXTO, com expressão regular, e
nunca constrói um `Date` para formatar. Passar por `Date` reinterpretaria o
instante no fuso do aparelho, que é exatamente o que este formato existe para
evitar. `spent_on` continua sendo a data local — é por ela que a lista agrupa e
a cotação é buscada — e tem de espelhar os dez primeiros caracteres de
`spent_at`; a tela deriva um do outro em vez de manter os dois na mão.

As quatro colunas novas são nulas. Despesa lançada antes desta versão não tem
hora nem lugar, e preencher meio-dia seria afirmar algo que ninguém registrou.

## 2026-09-08 — Coordenada e endereço são capturados separadamente

O GPS funciona offline; traduzir coordenada em nome de rua, não — quem faz isso
é o serviço de mapas do sistema, e ele precisa de rede. Num restaurante em outro
país é exatamente o que falta.

Por isso `capturePlace` grava a coordenada mesmo quando o endereço não vem, e a
tela diz isso ("Ponto guardado (35.6595, 139.7005) — sem rede para achar o
endereço"). Um ponto no mapa continua respondendo "onde foi esse jantar?" meses
depois; um campo vazio, não.

A permissão é pedida no toque do "Usar GPS", nunca na abertura do app: quem está
lançando uma despesa entende por que o aparelho perguntou. E o campo é um texto
comum — dá para escrever o lugar sem dar permissão nenhuma.

`formatAddress` mora em `state/format`, não junto do `capturePlace`, porque
aquele módulo importa `expo-location`: arrastar o runtime do Expo para dentro do
Node só para testar uma junção de strings faz a suíte inteira parar de rodar.
Aconteceu ao escrever este teste.

## 2026-09-08 — A despesa nova abre na moeda da última

Voltar para a moeda-base a cada lançamento estava errado na única situação que
importa: numa viagem ao Japão, TODAS as despesas são em iene, e o app pedia para
trocar de moeda toda vez. `lastExpenseCurrency` acerta quase sempre; quando erra,
custa um toque — o mesmo toque que custava sempre.

Ordena por `spent_on`, depois `spent_at`: duas despesas do mesmo dia precisam de
desempate, e a hora é o desempate certo. Não é a última INSERIDA — lançar hoje
uma despesa de ontem não pode mudar o padrão para amanhã.

## 2026-09-09 — Nova despesa não pergunta quando nem onde — **revoga em parte a de 08/09**

O card "Quando" / "Onde" saiu da tela de lançamento. Despesa nova grava os dois
sozinha: a hora já nascia em `localIso()` (isso não mudou), e o lugar agora é
capturado com `capturePlace()` num `useEffect` que roda uma vez, ao abrir a
tela — sem esperar toque em "Usar GPS".

Isso revoga a frase "a permissão é pedida no toque do Usar GPS" da decisão
anterior: agora ela é pedida ao abrir uma despesa nova, porque não existe mais
um botão para pedir por ela. Continua valendo o resto: sem permissão ou sem
rede a despesa é salva do mesmo jeito, porque `capturePlace` nunca lança, só
devolve um resultado que a tela ignora quando não tem onde mostrar.

O card volta a aparecer **só na edição** — é ali que faz sentido corrigir o que
a captura automática errou (GPS impreciso, esqueceu o celular no hotel), não em
toda despesa nova. Editar uma despesa já era o único lugar em que builds
anteriores tinham a hora exposta para correção; a diferença é que lançar não
pede mais nada.

## 2026-09-09 — A moeda da despesa vem só do que a viagem já escolheu

O seletor de moeda do lançamento deixou de abrir o catálogo do mundo inteiro
(o mesmo `CurrencyPicker` com busca que a abertura da viagem usa) e passou a
ser uma folha com as moedas que a viagem já tem — mesmo padrão do "Quem
pagou". `setTripCurrencies` sempre inclui a moeda-base, então a folha nunca
vem vazia.

Efeito colateral que vale registrar: não dá mais para acrescentar uma moeda
nova a uma viagem já criada lançando uma despesa nela — a única entrada para
isso hoje é a tela de abertura (`trip/new.tsx`). Se aparecer a necessidade de
adicionar moeda depois de aberta a viagem, é uma tela nova, não uma reversão
desta.

## 2026-09-09 — O IOF pergunta sim/não, sem mostrar a alíquota

A tela de despesa em moeda estrangeira perguntava "Esta compra tem IOF" com uma
legenda explicando por que ("cartão, espécie e conta global pagam a mesma
alíquota") e, se marcado, abria um campo para editar o percentual. Virou um
`Switch` só, rotulado "Tem IOF".

A alíquota nunca desapareceu — ela é sempre `DEFAULT_IOF_PPM`, ou a que a
despesa já tinha quando editada — só saiu de campo editável para valor fixo. O
número continua visível onde ele é útil de verdade: na decomposição acima do
formulário ("R$ 458,80 + IOF R$ 16,06"). Editar a alíquota manualmente deixou
de ser possível pela tela; se o decreto mudar de novo, é `IOF_DEFAULT_PPM` que
muda, não um campo que cada pessoa lembra de ajustar.

## 2026-09-09 — Moeda por rádio, não por folha — **revoga a de 09/09 sobre a folha**

A folha de moeda durou uma versão. Trocada por uma fileira de `RadioChip`
acima do valor: o mesmo padrão do `Chip`, com um dote de rádio que mostra a
seleção sem precisar abrir nada. Continua valendo o essencial da decisão
anterior — só as moedas que a viagem já tem, moeda-base sempre incluída — só
mudou a interação.

Faz sentido especificamente aqui porque o conjunto é sempre pequeno (a
viagem raramente tem mais que duas ou três moedas) e cabe inteiro na tela: com
poucas opções sempre visíveis, abrir uma folha para escolher era um toque a
mais para ver o que já cabia ali. Some quando a viagem tem só uma moeda — não
há o que escolher.

`RadioChip` foi para `src/ui/components.tsx`, ao lado do `Chip`: é um padrão
de seleção única — o círculo marca "só esta pode estar marcada" — diferente do
quadrado que a lista de "Dividir entre" usa, que é seleção múltipla.

## 2026-09-09 — IOF sai da caixa, e o câmbio para de explicar o óbvio

Duas limpezas na mesma tela, pedidas juntas:

- **O IOF deixou de estar dentro do card de câmbio.** Virou uma linha solta,
  sem moldura, ainda só sim/não. A caixa continua existindo — mas só para o
  campo de taxa, que tem busca online e mensagem de erro para justificá-la; o
  IOF nunca precisou dela.
- **Some a pergunta "Quanto vale 1 USD em BRL?".** O "≈" e a "taxa" que já
  aparecem acima, na decomposição do valor, dizem a mesma coisa. O texto só
  volta durante a busca ("Buscando a cotação de hoje…"), que é a única hora
  em que uma frase ali ajuda de verdade.
