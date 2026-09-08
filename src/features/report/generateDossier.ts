/**
 * Junta o dossiê a partir do banco. Fica separado da tela para poder ser
 * testado contra uma viagem de verdade, sem renderizar nada.
 */
import type { Database } from '@/db/driver';
import { getTrip, listExpenses, listParticipants, listSettlements, loadLedger } from '@/db/repositories';
import { buildDossier, type TripDossier } from '@/domain/dossier';
import { stripDiacritics } from '@/domain/pix';
import { timeLabel } from '@/state/format';
import { renderDossierHtml } from './dossierHtml';

export function buildTripDossier(db: Database, tripId: string, generatedOn: string): TripDossier {
  const trip = getTrip(db, tripId);
  if (trip === undefined) throw new Error(`Viagem não encontrada: ${tripId}`);

  return buildDossier(loadLedger(db, tripId), {
    tripName: trip.name,
    startsOn: trip.starts_on,
    endsOn: trip.ends_on,
    generatedOn,
    names: Object.fromEntries(listParticipants(db, tripId).map((p) => [p.id, p.display_name])),
    expenses: Object.fromEntries(
      listExpenses(db, tripId).map((row) => [
        row.id,
        {
          description: row.description,
          category: row.category,
          spentOn: row.spent_on,
          timeLabel: timeLabel(row.spent_at),
          placeLabel: row.place_label ?? undefined,
        },
      ]),
    ),
    settlements: Object.fromEntries(
      listSettlements(db, tripId).map((row) => [row.id, row.settled_on]),
    ),
  });
}

export function renderTripDossier(db: Database, tripId: string, generatedOn: string): string {
  return renderDossierHtml(buildTripDossier(db, tripId, generatedOn));
}

/** Nome do arquivo que a pessoa vai ver ao compartilhar. */
export function dossierFileName(tripName: string): string {
  // Sem tirar o acento antes, "Japão" viraria "jap-o" no nome do arquivo.
  const slug = stripDiacritics(tripName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
  return `dossie-${slug === '' ? 'viagem' : slug}`;
}
