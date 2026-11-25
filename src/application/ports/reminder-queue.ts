import type { AppointmentStatus } from '../../domain/appointment.js';
import type { SkipReason } from '../../domain/reminder.js';
import type { TimeZone } from '../../domain/time-zone.js';

/** Recordatorio reclamado por una pasada, con los datos necesarios para decidir y componer el mensaje. */
export interface ClaimedReminder {
  readonly id: string;
  /** Identifica el claim de esta pasada: toda escritura posterior solo vale si sigue siendo el vigente. */
  readonly claimToken: string;
  readonly attempts: number;
  /** Hora de la cita para la que se creó este recordatorio. */
  readonly forStartsAt: Date;
  /** Estado de la cita al reclamar; puede haber cambiado cuando se guarde el resultado. */
  readonly appointmentStatus: AppointmentStatus;
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
/** Qué hacer con un intento no entregado si el recordatorio sigue siendo el vigente. */
export type FailedAttempt = { readonly kind: 'retry'; readonly at: Date } | { readonly kind: 'fail' };

export interface ReminderQueue {
  /** Reclama hasta `limit` recordatorios `pending` con `next_attempt_at <= now` y sin claim vigente. */
  claimDue(now: Date, limit: number): Promise<ClaimedReminder[]>;
  /** Cuenta un intento (attempts + 1); se hace antes de llamar al proveedor. */
  recordAttempt(reminder: ClaimedReminder): Promise<boolean>;
  markSent(reminder: ClaimedReminder, sentAt: Date): Promise<boolean>;
  markSkipped(reminder: ClaimedReminder, reason: SkipReason): Promise<boolean>;
  /** Cancela un recordatorio que ya no es el vigente (cita cancelada o reprogramada). */
  markCancelled(reminder: ClaimedReminder): Promise<boolean>;
  /**
   * Guarda un intento no entregado. Con el estado de la cita en el momento de escribir (no el de reclamar):
   * si el recordatorio ya no es el vigente queda `cancelled`; si no, `retry` lo deja `pending` para
   * `at` y `fail` lo deja `failed`.
   */
  settleFailedAttempt(reminder: ClaimedReminder, next: FailedAttempt): Promise<boolean>;
}
