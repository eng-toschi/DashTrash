# Rodar no celular

O app roda pelo **Expo Go**: você não precisa de Xcode, Android Studio, conta de
desenvolvedor nem build nativo. Serve para iPhone e Android.

> O servidor de desenvolvimento precisa rodar **na sua máquina**, não num container
> remoto — é o seu computador que o celular vai acessar pela rede local.

## 1. Instale o Expo Go no celular

- **iPhone:** App Store → "Expo Go"
- **Android:** Play Store → "Expo Go"

## 2. No seu computador

Precisa de **Node 20 ou mais novo** (`node -v` para conferir).

Primeira vez:

```bash
git clone -b claude/travel-expense-splitting-app-33pgc6 https://github.com/eng-toschi/DashTrash.git
cd DashTrash
npm install
npx expo start
```

**Pegando uma versão nova** (é este o caso quando eu digo "já subi"):

```bash
cd ~/DashTrash
git pull origin claude/travel-expense-splitting-app-33pgc6
npm install
npx expo start -c
```

As três linhas importam, e cada uma já foi o motivo de um teste falso aqui:

- `npm install` — quando a versão nova traz uma biblioteca (as fontes do b15, por
  exemplo), pular isso derruba o app com "Unable to resolve …".
- `-c` limpa o cache do bundler. Sem ele o Metro serve o pacote antigo e a
  correção parece não ter funcionado.
- Confira a **marca de versão no alto da home** (`b15`, `b16`…) antes de julgar a
  tela. Ela existe justamente porque isso já aconteceu duas vezes.

Se o `git pull` reclamar de alteração local em `tsconfig.json`, é o próprio Expo
que reescreve o arquivo ao iniciar: `git checkout -- tsconfig.json` e repita.

Vai aparecer um **QR code** no terminal.

## 3. Abra no celular

- **iPhone:** aponte a câmera nativa para o QR e toque na notificação.
- **Android:** abra o Expo Go → "Scan QR code" → aponte para o QR.

O celular e o computador precisam estar **na mesma rede Wi-Fi**.

## Se algo não funcionar

| Sintoma | O que fazer |
|---|---|
| O celular não acha o servidor | Wi-Fi corporativo ou com isolamento de clientes costuma bloquear. Use `npx expo start --tunnel` |
| Tela branca ou erro estranho depois de trocar de branch | `npx expo start -c` (limpa o cache do bundler) |
| `npm install` reclama de `better-sqlite3` | É só para os testes; o app roda mesmo assim. No macOS resolve com `xcode-select --install` |
| Erro de versão do Expo Go | Atualize o Expo Go na loja — o app usa o SDK 57 |

## O que dá para testar agora (Fase 3)

Tudo funciona **sem internet** — pode ligar o modo avião e continuar usando.

1. **Criar viagem** — nome, moeda do acerto, e os participantes só pelo nome.
2. **Lançar despesa** — repare no seletor "dividir entre": desmarque uma pessoa e
   veja o valor por cabeça mudar na hora.
3. **Despesa em outra moeda** — escolha JPY ou EUR. Como ainda não existe busca de
   cotação (Fase 4), o app pede a taxa. Depois disso a decomposição aparece:
   valor convertido, IOF e a taxa usada.
4. **Divisão por valor exato** — o botão de salvar fica bloqueado enquanto a soma
   não fechar, dizendo quanto falta.
5. **Saldos** — a aba ao lado de Despesas. A soma tem que dar exatamente zero.
6. **Fechamento** — quem paga a quem, nos dois modos. Cadastre uma chave Pix em
   Participantes e o botão "Pix copia e cola" aparece, com o valor embutido.
7. **Tema escuro** — o botão redondo no canto superior direito da home cicla
   entre automático (segue o aparelho), claro e escuro.
8. **Quando e onde** — despesa nova não pergunta nada disso: ao abrir a tela, ela
   já pede a localização sozinha (é aí que a permissão aparece) e grava a hora
   do momento. Vale testar **em modo avião**: a coordenada é guardada mesmo
   assim, sem endereço. Para corrigir hora ou lugar, **edite** a despesa depois
   de salva — é só ali que o card "Quando" / "Onde" aparece.
9. **Moeda repetida** — lance uma despesa em outra moeda e abra a próxima: ela
   já vem naquela moeda, não na do acerto. O seletor de moeda só mostra as que
   a viagem já usa — para uma moeda nova, é preciso abrir de novo em "Nova
   viagem".

### O que ainda NÃO existe

- Convite por link ou QR, e sincronização entre aparelhos (Fase 6). A viagem vive
  só naquele celular.
- Busca automática de cotação (Fase 4).
- Foto de recibo, exportar CSV, notificações (Fase 7).

### O que vale me contar

Hierarquia e ritmo das telas, o que ficou pequeno demais para o dedo, onde você
hesitou, e principalmente: **algum valor que pareceu errado**. Print ajuda.

## Publicar de verdade (fora do Expo Go)

Expo Go é ótimo para testar rápido, mas depende de você estar com o app aberto
e a pergunta de escanear QR toda vez. Um **build** é um instalável de verdade —
ícone próprio na tela, sem depender de nada disso.

### Android — hoje, de graça

1. Crie uma conta em [expo.dev](https://expo.dev) (grátis; é diferente da conta
   do GitHub).
2. No terminal, dentro de `~/DashTrash`:
   ```bash
   npm install -g eas-cli
   eas login
   eas build --profile preview --platform android
   ```
   O perfil `preview` (já configurado em `eas.json`) gera um **APK**, não o
   formato que a Play Store exige — é o jeito de instalar direto, sem loja.
3. O build roda na nuvem da Expo (uns 10–15 min.; a conta grátis inclui um
   número limitado de builds por mês, suficiente para isso). No fim aparece um
   link — abra ele no celular Android e instale habilitando "fontes
   desconhecidas" quando o sistema perguntar.

### iPhone — exige conta paga da Apple

Não existe caminho gratuito razoável aqui: um build sem conta paga expira em
7 dias, sempre. Com a **Apple Developer Program** (US$ 99/ano, conta seguindo
o mesmo padrão da Expo — pessoal, em seu nome): TestFlight, até 100
testadores, build válido por 90 dias por vez.

```bash
eas build --profile preview --platform ios
```

Na primeira vez o EAS pergunta interativamente pelas credenciais da Apple e
cuida de gerar certificado e provisionamento — não precisa mexer no Xcode.

### O domínio no registro.br

Ainda não usei ele em nada — falta eu saber para o quê, porque muda o que
preciso montar:

- **Uma página para baixar o APK**, em vez de mandar o link cru do build da
  Expo — mais simples, e só precisa de uma página estática.
- **O link de convite abrindo o app direto** (`https://seudominio/j/{token}`
  → abre o RachaPila se instalado, ou cai numa página web se não) — é o
  "link universal" da Fase 6, e exige hospedar dois arquivos de verificação
  (`apple-app-site-association` e `assetlinks.json`) num servidor de verdade
  atrás do domínio, não só configurar DNS.
- Os dois, ou algo além disso (uma página de apresentação do app, por
  exemplo).
