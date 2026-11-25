import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, nextAttempt } from '../../src/domain/retry-policy.js';

const failedAt = new Date('2027-06-16T08:00:00.000Z');

describe('nextAttempt', () => {
  it('tras el primer fallo reintenta 1 minuto después (límite exacto +60000 ms)', () => {
    expect(nextAttempt(1, failedAt)).toEqual(new Date('2027-06-16T08:01:00.000Z'));
  });

  it('tras el segundo fallo reintenta 5 minutos después (límite exacto +300000 ms)', () => {
    expect(nextAttempt(2, failedAt)).toEqual(new Date('2027-06-16T08:05:00.000Z'));
  });

  it('tras el tercer fallo se rinde', () => {
    expect(nextAttempt(3, failedAt)).toBe('give_up');
  });

  it('se rinde también si ya se superó el máximo', () => {
    expect(nextAttempt(4, failedAt)).toBe('give_up');
  });

  it('el máximo es de 3 intentos', () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });

  it('no modifica la fecha recibida', () => {
    nextAttempt(1, failedAt);
    expect(failedAt.toISOString()).toBe('2027-06-16T08:00:00.000Z');
  });
});
