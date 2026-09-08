/**
 * Gera o dossiê e entrega ao compartilhamento do sistema.
 *
 * Fica fora das telas porque é chamado de dois lugares — no encerramento e na
 * lista de viagens encerradas — e duplicar isso significaria dois documentos
 * diferentes com o tempo.
 */
import { Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Database } from '@/db/driver';
import { dossierFileName, renderTripDossier } from './generateDossier';

export async function shareTripDossier(
  db: Database,
  tripId: string,
  tripName: string,
  today: string,
): Promise<void> {
  try {
    const html = renderTripDossier(db, tripId, today);
    const { uri } = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: dossierFileName(tripName),
      });
    } else {
      await Print.printAsync({ html });
    }
  } catch {
    Alert.alert('Não consegui gerar o dossiê', 'Tente de novo em alguns segundos.');
  }
}
