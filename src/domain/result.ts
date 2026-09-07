/**
 * Result explícito para erros de validação que a UI precisa mostrar
 * (ex.: "faltam R$ 3,40" numa divisão exata).
 *
 * Erros de programação — moeda incompatível, centavo fracionário, participante
 * inexistente — continuam sendo `throw`: são bug, não estado de tela.
 */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Erro de invariante do domínio. Se isto estoura, os dados estão corrompidos. */
export class DomainError extends Error {
  override readonly name = 'DomainError';
}

export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new DomainError(message);
}
