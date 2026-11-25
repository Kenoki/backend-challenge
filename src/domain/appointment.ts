import { ConflictError, ValidationError } from './errors.js';
import { planReminder, type PlanReminderInput } from './reminder-schedule.js';
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

/** Recordatorio nuevo para `startsAt` (pending, o skipped/too_late si ya no cabe antes de la cita). */
function newReminder(id: string, input: PlanReminderInput): Reminder {
  const plan = planReminder(input);
  const common = {
    id,
    forStartsAt: input.startsAt,
    scheduledFor: plan.scheduledFor,
    nextAttemptAt: plan.scheduledFor,
    attempts: 0,
  };
  return plan.status === 'pending'
    ? { ...common, status: 'pending' }
    : { ...common, status: 'skipped', skipReason: plan.skipReason };
}

/** Crea una cita `scheduled` con su primer recordatorio, planificado según la hora de envío. */
export function createAppointment(input: CreateAppointmentInput): Appointment {
  const { id, clinicId, patientId, startsAt, timeZone, now, reminderId } = input;
  assertStartsInFuture(startsAt, now);
  const reminder = newReminder(reminderId, { startsAt, timeZone, now });
  return { id, clinicId, patientId, startsAt, status: 'scheduled', reminders: [reminder] };
}

/**
 * Anula la intención de enviar los recordatorios pendientes. Aquí se expresa "cancelar los pendientes";
 * que uno esté en vuelo (reclamado por una pasada) lo decide la persistencia, que no lo cancela (ADR 0001).
 */
function cancelPending(reminders: readonly Reminder[]): Reminder[] {
  return reminders.map((reminder): Reminder => (reminder.status === 'pending' ? { ...reminder, status: 'cancelled' } : reminder));
}

export interface RescheduleInput {
  readonly startsAt: Date;
  readonly timeZone: TimeZone;
  readonly now: Date;
  readonly newReminderId: string;
}

/**
 * Cambia el inicio de una cita que no está cancelada ni ha empezado: cancela los recordatorios pendientes,
 * conserva el resto (ADR 0002), añade el nuevo y devuelve la cita a `scheduled`.
 * Orden de errores: cancelada o ya empezada (409) -> nuevo inicio no futuro (400).
 */
export function rescheduleAppointment(appointment: Appointment, input: RescheduleInput): Appointment {
  const { startsAt, timeZone, now, newReminderId } = input;
  if (appointment.status === 'cancelled') throw new ConflictError('La cita está cancelada');
  if (appointment.startsAt.getTime() <= now.getTime()) throw new ConflictError('La cita ya ha empezado');
  assertStartsInFuture(startsAt, now);
  return {
    ...appointment,
    startsAt,
    status: 'scheduled',
    reminders: [...cancelPending(appointment.reminders), newReminder(newReminderId, { startsAt, timeZone, now })],
  };
}

/** Cancela la cita y sus recordatorios pendientes. Idempotente: una cita ya cancelada se devuelve tal cual. */
export function cancelAppointment(appointment: Appointment): Appointment {
  if (appointment.status === 'cancelled') return appointment;
  return { ...appointment, status: 'cancelled', reminders: cancelPending(appointment.reminders) };
}
