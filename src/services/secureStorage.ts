/**
 * Armazenamento da sessão do Supabase no Keychain/Keystore (spec §12).
 *
 * "Sessão no SecureStore, nunca em AsyncStorage" não é preciosismo: a sessão
 * carrega o refresh token, que é a chave que reabre a conta de qualquer
 * aparelho por meses. AsyncStorage é um arquivo de texto sem proteção nenhuma;
 * SecureStore é o Keychain no iOS e o Keystore no Android.
 *
 * O SecureStore tem um limite de tamanho por entrada, e a sessão do Supabase
 * (access token + refresh token + dados do usuário, em JSON) passa dele com
 * frequência. Por isso o valor é dividido em pedaços — `splitIntoChunks` fica
 * em `state/textChunks.ts`, sem depender do SecureStore, para poder testar a
 * divisão sem precisar de um aparelho.
 */
import * as SecureStore from 'expo-secure-store';
import { joinChunks, splitIntoChunks } from '@/state/textChunks';

/**
 * Abaixo do limite histórico de 2048 bytes por entrada. Não dá para confiar
 * em "esse limite foi removido numa versão mais nova" — não custa nada ficar
 * bem abaixo dele.
 */
const CHUNK_SIZE = 1800;

function countKey(key: string): string {
  return `${key}.count`;
}

function chunkKey(key: string, index: number): string {
  return `${key}.${String(index)}`;
}

/**
 * Interface que o Supabase (`auth.storage`) espera: três métodos, todos
 * assíncronos. Implementada aqui em cima do SecureStore com divisão em
 * pedaços — por fora, para quem chama, é uma entrada só.
 */
export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countText = await SecureStore.getItemAsync(countKey(key));
    if (countText === null) return null;

    const count = Number(countText);
    if (!Number.isInteger(count) || count < 0) return null;

    const chunks: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, index));
      // Um pedaço sumiu (app apagado no meio de uma gravação, por exemplo):
      // a sessão inteira é inválida. Devolver metade dela seria pior do que
      // devolver "sem sessão" — o app pede login de novo, o que é seguro.
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return joinChunks(chunks);
  },

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = Number(await SecureStore.getItemAsync(countKey(key)));
    const chunks = splitIntoChunks(value, CHUNK_SIZE);

    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)));

    // A sessão nova pode ter menos pedaços que a antiga (token mais curto) —
    // sem isto, um pedaço velho ficaria para trás e `getItem` o devolveria
    // colado no fim do valor novo.
    if (Number.isInteger(previousCount)) {
      for (let index = chunks.length; index < previousCount; index += 1) {
        await SecureStore.deleteItemAsync(chunkKey(key, index));
      }
    }

    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (Number.isInteger(count)) {
      for (let index = 0; index < count; index += 1) {
        await SecureStore.deleteItemAsync(chunkKey(key, index));
      }
    }
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
