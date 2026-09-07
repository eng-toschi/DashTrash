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

```bash
git clone -b claude/travel-expense-splitting-app-33pgc6 https://github.com/eng-toschi/DashTrash.git
cd DashTrash
npm install
npx expo start
```

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
7. **Tema escuro** — mude no sistema operacional; o app acompanha.

### O que ainda NÃO existe

- Convite por link ou QR, e sincronização entre aparelhos (Fase 6). A viagem vive
  só naquele celular.
- Busca automática de cotação (Fase 4).
- Foto de recibo, exportar CSV, notificações (Fase 7).

### O que vale me contar

Hierarquia e ritmo das telas, o que ficou pequeno demais para o dedo, onde você
hesitou, e principalmente: **algum valor que pareceu errado**. Print ajuda.
