import type { SkipReason } from '../../domain/reminder.js';
import type { TimeZone } from '../../domain/time-zone.js';

/** Recordatorio reclamado por una pasada, con los datos necesarios para decidir y componer el mensaje. */
export interface ClaimedReminder {
  readonly id: string;
  /** Identifica el claim de esta pasada: toda escritura posterior solo vale si sigue siendo el vigente. */
  readonly claimToken: string;
  readonly attempts: number;
  readonly appointmentStartsAt: Date;
  readonly patientName: string;
  readonly phone: string | null;
  readonly acceptsReminders: boolean;
  readonly clinicName: string;
  readonly timeZone: TimeZone;
}

/**
 * Cola de recordatorios de una pasada (ADR 0001). Cada escritura está condicionada al claim y
 * devuelve `false` si la pasada ya no es dueña del recordatorio: entonces su resultado se descarta.
 */
export interface ReminderQueue {
  /** Reclama hasta `limit` recordatorios `pending` con `next_attempt_at <= now` y sin claim vigente. */
  claimDue(now: Date, limit: number): Promise<ClaimedReminder[]>;
  /** Cuenta un intento (attempts + 1); se hace antes de llamar al proveedor. */
  recordAttempt(reminder: ClaimedReminder): Promise<boolean>;
  markSent(reminder: ClaimedReminder, sentAt: Date): Promise<boolean>;
  markSkipped(reminder: ClaimedReminder, reason: SkipReason): Promise<boolean>;
  markFailed(reminder: ClaimedReminder): Promise<boolean>;
  /** Suelta el claim y deja el recordatorio `pending`, para un nuevo intento a partir de `nextAttemptAt`. */
  scheduleRetry(reminder: ClaimedReminder, nextAttemptAt: Date): Promise<boolean>;
}
