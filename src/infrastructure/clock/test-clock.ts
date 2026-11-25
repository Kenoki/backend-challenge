import type { Clock } from '../../application/ports/clock.js';

/** Reloj fijable: hora real hasta el primer set; después, el instante fijado congelado. */
export class TestClock implements Clock {
  private fixedMs: number | undefined;

  set(at: Date): void {
    this.fixedMs = at.getTime();
  }

  now(): Date {
    return this.fixedMs === undefined ? new Date() : new Date(this.fixedMs);
  }
}
