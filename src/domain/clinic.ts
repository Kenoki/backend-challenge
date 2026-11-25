import type { TimeZone } from './time-zone.js';

export interface Clinic {
  readonly id: string;
  readonly name: string;
  readonly timeZone: TimeZone;
}
