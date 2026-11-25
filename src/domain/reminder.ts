export type SkipReason = 'too_late' | 'no_phone' | 'opted_out';

interface ReminderBase {
  readonly id: string;
  /** Inicio de la cita para el que se creó; los de reprogramaciones anteriores quedan en el historial. */
  readonly forStartsAt: Date;
  readonly scheduledFor: Date;
  readonly nextAttemptAt: Date;
  readonly attempts: number;
}

/**
 * Recordatorio como unión discriminada por `status`: `skipReason` solo existe en `skipped` y
 * `sentAt` solo en `sent`, de modo que los estados ilegales no se pueden construir.
 */
export type Reminder =
  | (ReminderBase & { readonly status: 'pending' })
  | (ReminderBase & { readonly status: 'sent'; readonly sentAt: Date })
  | (ReminderBase & { readonly status: 'failed' })
  | (ReminderBase & { readonly status: 'skipped'; readonly skipReason: SkipReason })
  | (ReminderBase & { readonly status: 'cancelled' });

export type ReminderStatus = Reminder['status'];
