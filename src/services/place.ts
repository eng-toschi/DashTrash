/**
 * Onde a despesa aconteceu (spec §8.2).
 *
 * Duas informações independentes, e é de propósito:
 *  - as COORDENADAS, que o GPS dá offline, no meio da viagem, sem sinal;
 *  - o ENDEREÇO em texto, que precisa de rede porque quem traduz coordenada em
 *    rua é o serviço de mapas do sistema.
 *
 * Por isso a coordenada é gravada mesmo quando o endereço não vem. Um ponto no
 * mapa continua respondendo "onde foi esse jantar?" meses depois; um campo
 * vazio, não. E é o oposto de fazer a captura inteira depender de rede — que é
 * justamente o que falta num restaurante em outro país.
 */
import * as Location from 'expo-location';
import { err, ok, type Result } from '@/domain/result';
import { formatAddress } from '@/state/format';

export interface CapturedPlace {
  readonly latitude: number;
  readonly longitude: number;
  /** Ausente quando o aparelho não conseguiu traduzir a coordenada em endereço. */
  readonly label?: string;
}

export type PlaceError =
  | { readonly code: 'denied' }
  | { readonly code: 'unavailable' };

/**
 * Pede a posição e tenta traduzi-la em endereço.
 *
 * A permissão é pedida no momento do toque, nunca na abertura do app: quem
 * lança uma despesa sabe por que o aparelho está perguntando.
 */
export async function capturePlace(): Promise<Result<CapturedPlace, PlaceError>> {
  let permission;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return err({ code: 'unavailable' });
  }
  if (!permission.granted) return err({ code: 'denied' });

  let position;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    return err({ code: 'unavailable' });
  }

  const { latitude, longitude } = position.coords;

  // Daqui para baixo é bônus: sem rede o `reverseGeocodeAsync` falha, e a
  // coordenada sozinha já é uma resposta.
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    const label = address === undefined ? undefined : formatAddress(address);
    return ok(label === undefined ? { latitude, longitude } : { latitude, longitude, label });
  } catch {
    return ok({ latitude, longitude });
  }
}
