import { ValidationError } from './errors.js';
import { planReminder } from './reminder-schedule.js';
import type { Reminder } from './reminder.js';
import type { TimeZone } from './time-zone.js';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled';

/** Agregado cita: contiene sus recordatorios, del más antiguo al más nuevo. */
export interface Appointment {
  readonly id: string;
  readonly clinicId: string;
  readonly patientId: string;
  readonly startsAt: Date;
  readonly status: AppointmentStatus;
  readonly reminders: readonly Reminder[];
}

/** Un inicio solo es válido si es estrictamente posterior a la hora del servicio. */
export function assertStartsInFuture(startsAt: Date, now: Date): void {
  if (startsAt.getTime() <= now.getTime()) {
    throw new ValidationError('startsAt debe ser posterior a la hora actual del servicio');
  }
}

export interface CreateAppointmentInput {
  readonly id: string;
  readonly clinicId: string;
  readonly patientId: string;
  readonly startsAt: Date;
  readonly timeZone: TimeZone;
  readonly now: Date;
  readonly reminderId: string;
}

/** Crea una cita `scheduled` con su primer recordatorio, planificado según la hora de envío. */
export function createAppointment(input: CreateAppointmentInput): Appointment {
  const { id, clinicId, patientId, startsAt, timeZone, now, reminderId } = input;
  assertStartsInFuture(startsAt, now);
  const plan = planReminder({ startsAt, timeZone, now });
  const common = {
    id: reminderId,
    forStartsAt: startsAt,
    scheduledFor: plan.scheduledFor,
    nextAttemptAt: plan.scheduledFor,
    attempts: 0,
  };
  const reminder: Reminder =
    plan.status === 'pending'
      ? { ...common, status: 'pending' }
      : { ...common, status: 'skipped', skipReason: plan.skipReason };
  return { id, clinicId, patientId, startsAt, status: 'scheduled', reminders: [reminder] };
}
