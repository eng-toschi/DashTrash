/**
 * Divisão de uma despesa (spec §7).
 *
 * v1 tem dois modos, de propósito: igual (entre todos ou entre um subgrupo) e
 * valor exato. Porcentagem, cotas e divisão por item foram cortados — ver §2 do
 * spec antes de adicionar qualquer variante aqui.
 */
import { allocateEqually, sumCents, type Allocation } from './money';
import { err, invariant, ok, type Result } from './result';

export type Split =
  | { readonly type: 'equal'; readonly participantIds: readonly string[] }
  | { readonly type: 'exact'; readonly entries: readonly ExactEntry[] };

export interface ExactEntry {
  readonly participantId: string;
  readonly cents: number;
}

export interface Share {
  readonly participantId: string;
  readonly cents: number;
}

export type SplitError =
  | { readonly code: 'no_participants' }
  | { readonly code: 'duplicate_participant'; readonly participantId: string }
  | { readonly code: 'negative_share'; readonly participantId: string }
  /** `differenceCents` > 0 = falta esse tanto; < 0 = passou. É o texto da UI. */
  | { readonly code: 'exact_mismatch'; readonly differenceCents: number };

function findDuplicate(ids: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

/**
 * Calcula quanto cada participante deve. A soma do resultado é sempre
 * exatamente `totalCents` — em `equal` por construção (`allocate`), em `exact`
 * porque somas divergentes são recusadas.
 */
export function computeShares(totalCents: number, split: Split): Result<Share[], SplitError> {
  invariant(Number.isSafeInteger(totalCents) && totalCents > 0, 'Total da despesa deve ser inteiro positivo.');

  const ids =
    split.type === 'equal' ? split.participantIds : split.entries.map((e) => e.participantId);

  if (ids.length === 0) return err({ code: 'no_participants' });
  const duplicate = findDuplicate(ids);
  if (duplicate !== undefined) return err({ code: 'duplicate_participant', participantId: duplicate });

  if (split.type === 'equal') {
    return ok(toShares(allocateEqually(totalCents, split.participantIds)));
  }

  for (const entry of split.entries) {
    invariant(Number.isSafeInteger(entry.cents), 'Valor exato deve ser inteiro.');
    if (entry.cents < 0) return err({ code: 'negative_share', participantId: entry.participantId });
  }

  const difference = totalCents - sumCents(split.entries.map((e) => e.cents));
  if (difference !== 0) return err({ code: 'exact_mismatch', differenceCents: difference });

  return ok(split.entries.map((e) => ({ participantId: e.participantId, cents: e.cents })));
}

function toShares(allocations: readonly Allocation[]): Share[] {
  return allocations.map((a) => ({ participantId: a.id, cents: a.cents }));
}
