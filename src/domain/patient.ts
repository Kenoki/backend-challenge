import type { PhoneNumber } from './phone-number.js';

export interface Patient {
  readonly id: string;
  readonly clinicId: string;
  readonly name: string;
  readonly phone: PhoneNumber | null;
  readonly acceptsReminders: boolean;
}
