import { describe, expect, it } from 'vitest';
import { TestClock } from '../../src/infrastructure/clock/test-clock.js';

const realNowMs = (): number => performance.timeOrigin + performance.now();

describe('TestClock', () => {
  it('devuelve la hora real antes del primer set', () => {
    const before = realNowMs();
    const now = new TestClock().now().getTime();
    const after = realNowMs();

    expect(now).toBeGreaterThanOrEqual(before - 5);
    expect(now).toBeLessThanOrEqual(after + 5);
  });

  it('tras set devuelve exactamente ese instante y queda congelado', async () => {
    const clock = new TestClock();
    clock.set(new Date('2027-03-27T08:00:00Z'));

    const first = clock.now();
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = clock.now();

    expect(first.toISOString()).toBe('2027-03-27T08:00:00.000Z');
    expect(second.toISOString()).toBe('2027-03-27T08:00:00.000Z');
  });

  it('un segundo set cambia la hora', () => {
    const clock = new TestClock();
    clock.set(new Date('2027-03-27T08:00:00Z'));
    clock.set(new Date('2028-01-01T00:00:00Z'));

    expect(clock.now().toISOString()).toBe('2028-01-01T00:00:00.000Z');
  });

  it('mutar el Date devuelto o el pasado a set no altera el reloj', () => {
    const clock = new TestClock();
    const input = new Date('2027-03-27T08:00:00Z');
    clock.set(input);
    input.setUTCFullYear(1999);
    clock.now().setUTCFullYear(2001);

    expect(clock.now().toISOString()).toBe('2027-03-27T08:00:00.000Z');
  });
});
