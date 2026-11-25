/** Espera tras cada fallo transitorio: el primero espera 1 min y el segundo 5 min. */
const RETRY_DELAYS_MS: readonly number[] = [60_000, 300_000];

/** Intentos totales antes de rendirse: el primero más un reintento por cada espera. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/**
 * Política de reintentos: cuándo volver a intentar tras fallar el intento número `attemptsMade`,
 * o `'give_up'` si ya se agotaron los intentos. Parte de la hora del fallo, no de la prevista.
 */
export function nextAttempt(attemptsMade: number, failedAt: Date): Date | 'give_up' {
  const delay = RETRY_DELAYS_MS[attemptsMade - 1];
  if (delay === undefined) return 'give_up';
  return new Date(failedAt.getTime() + delay);
}
