import { describe, expect, it } from 'vitest';
import { cancelAppointment, rescheduleAppointment, type Appointment } from '../../src/domain/appointment.js';
import { ConflictError, ValidationError } from '../../src/domain/errors.js';
import type { Reminder } from '../../src/domain/reminder.js';
import { TimeZone } from '../../src/domain/time-zone.js';

const madrid = TimeZone.parse('Europe/Madrid');

const reminderFor = (id: string, forStartsAt: string, status: Reminder['status']): Reminder => {
  const common = {
    id,
    forStartsAt: new Date(forStartsAt),
    scheduledFor: new Date('2027-03-27T09:00:00.000Z'),
    nextAttemptAt: new Date('2027-03-27T09:00:00.000Z'),
    attempts: 0,
  };
  switch (status) {
    case 'sent':
      return { ...common, status, sentAt: new Date('2027-03-27T09:00:01.000Z') };
    case 'skipped':
      return { ...common, status, skipReason: 'too_late' };
    default:
      return { ...common, status };
  }
};

const appointmentWith = (overrides: Partial<Appointment>): Appointment => ({
  id: 'a1',
  clinicId: 'c1',
  patientId: 'p1',
  startsAt: new Date('2027-03-28T08:00:00.000Z'),
  status: 'scheduled',
  reminders: [reminderFor('r1', '2027-03-28T08:00:00.000Z', 'pending')],
  ...overrides,
});

const reschedule = (appointment: Appointment, startsAt: string, now = '2027-03-01T00:00:00.000Z') =>
  rescheduleAppointment(appointment, {
    startsAt: new Date(startsAt),
    timeZone: madrid,
    now: new Date(now),
    newReminderId: 'r2',
  });

describe('rescheduleAppointment', () => {
  it('cancela el pendiente y añade uno nuevo pending para la nueva hora', () => {
    const result = reschedule(appointmentWith({}), '2027-04-10T08:00:00.000Z');

    expect(result.startsAt).toEqual(new Date('2027-04-10T08:00:00.000Z'));
    expect(result.reminders).toEqual([
      reminderFor('r1', '2027-03-28T08:00:00.000Z', 'cancelled'),
      {
        id: 'r2',
        forStartsAt: new Date('2027-04-10T08:00:00.000Z'),
        scheduledFor: new Date('2027-04-09T08:00:00.000Z'),
        nextAttemptAt: new Date('2027-04-09T08:00:00.000Z'),
        status: 'pending',
        attempts: 0,
      },
    ]);
  });

  it('conserva el enviado y añade uno pending: [sent, pending]', () => {
    const sent = reminderFor('r1', '2027-03-28T08:00:00.000Z', 'sent');

    const result = reschedule(appointmentWith({ reminders: [sent] }), '2027-04-10T08:00:00.000Z');

    expect(result.reminders.map((r) => [r.id, r.status])).toEqual([
      ['r1', 'sent'],
      ['r2', 'pending'],
    ]);
    expect(result.reminders[0]).toBe(sent);
  });

  it('deja intactos failed y skipped', () => {
    const failed = reminderFor('r0', '2027-03-20T08:00:00.000Z', 'failed');
    const skipped = reminderFor('r1', '2027-03-28T08:00:00.000Z', 'skipped');

    const result = reschedule(appointmentWith({ reminders: [failed, skipped] }), '2027-04-10T08:00:00.000Z');

    expect(result.reminders.map((r) => r.status)).toEqual(['failed', 'skipped', 'pending']);
  });

  it('cancela el pendiente y conserva el enviado en un historial mixto', () => {
    const sent = reminderFor('r0', '2027-03-20T08:00:00.000Z', 'sent');
    const pending = reminderFor('r1', '2027-03-28T08:00:00.000Z', 'pending');

    const result = reschedule(appointmentWith({ reminders: [sent, pending] }), '2027-04-10T08:00:00.000Z');

    expect(result.reminders.map((r) => r.status)).toEqual(['sent', 'cancelled', 'pending']);
  });

  it('una cita confirmed vuelve a scheduled', () => {
    const result = reschedule(appointmentWith({ status: 'confirmed' }), '2027-04-10T08:00:00.000Z');

    expect(result.status).toBe('scheduled');
  });

  it('el nuevo recordatorio es skipped too_late si ya no cabe', () => {
    // Nueva cita a las 08:00 locales (07:00Z); ahora 22:00 locales la víspera.
    const result = reschedule(appointmentWith({}), '2027-02-10T07:00:00.000Z', '2027-02-09T21:00:00.000Z');

    expect(result.reminders.at(-1)).toMatchObject({ id: 'r2', status: 'skipped', skipReason: 'too_late' });
  });

  it('la misma hora es una reprogramación normal', () => {
    const result = reschedule(appointmentWith({}), '2027-03-28T08:00:00.000Z');

    expect(result.reminders.map((r) => [r.id, r.status])).toEqual([
      ['r1', 'cancelled'],
      ['r2', 'pending'],
    ]);
  });

  it('no modifica el agregado original', () => {
    const original = appointmentWith({});

    reschedule(original, '2027-04-10T08:00:00.000Z');

    expect(original.reminders).toHaveLength(1);
    expect(original.reminders[0]?.status).toBe('pending');
  });

  it('ConflictError si la cita está cancelada', () => {
    expect(() => reschedule(appointmentWith({ status: 'cancelled' }), '2027-04-10T08:00:00.000Z')).toThrow(
      ConflictError,
    );
    expect(() => reschedule(appointmentWith({ status: 'cancelled' }), '2027-04-10T08:00:00.000Z')).toThrow(
      /cancelada/,
    );
  });

  it('ConflictError si ya empezó o empieza justo ahora', () => {
    const started = appointmentWith({ startsAt: new Date('2027-03-01T00:00:00.000Z') });
    expect(() => reschedule(started, '2027-04-10T08:00:00.000Z')).toThrow(ConflictError);
    expect(() => reschedule(started, '2027-04-10T08:00:00.000Z')).toThrow(/empezado/);
    const earlier = appointmentWith({ startsAt: new Date('2027-02-28T00:00:00.000Z') });
    expect(() => reschedule(earlier, '2027-04-10T08:00:00.000Z')).toThrow(ConflictError);
  });

  it('una cita que empieza un milisegundo después de ahora aún se puede reprogramar', () => {
    const almost = appointmentWith({ startsAt: new Date('2027-03-01T00:00:00.001Z') });

    expect(() => reschedule(almost, '2027-04-10T08:00:00.000Z')).not.toThrow();
  });

  it('ValidationError si la nueva hora no es futura, o igual a ahora', () => {
    expect(() => reschedule(appointmentWith({}), '2027-02-28T08:00:00.000Z')).toThrow(ValidationError);
    expect(() => reschedule(appointmentWith({}), '2027-02-28T08:00:00.000Z')).toThrow(/startsAt/);
    expect(() => reschedule(appointmentWith({}), '2027-03-01T00:00:00.000Z')).toThrow(ValidationError);
  });

  it('el conflicto va antes que la validación de hora no futura', () => {
    expect(() => reschedule(appointmentWith({ status: 'cancelled' }), '2027-02-28T08:00:00.000Z')).toThrow(
      ConflictError,
    );
  });
});

describe('cancelAppointment', () => {
  it('pasa la cita a cancelled y su pendiente a cancelled', () => {
    const result = cancelAppointment(appointmentWith({}));

    expect(result.status).toBe('cancelled');
    expect(result.reminders).toEqual([reminderFor('r1', '2027-03-28T08:00:00.000Z', 'cancelled')]);
  });

  it('deja intactos sent, failed y skipped', () => {
    const reminders = [
      reminderFor('r1', '2027-03-20T08:00:00.000Z', 'sent'),
      reminderFor('r2', '2027-03-21T08:00:00.000Z', 'failed'),
      reminderFor('r3', '2027-03-22T08:00:00.000Z', 'skipped'),
    ];

    const result = cancelAppointment(appointmentWith({ reminders }));

    expect(result.reminders).toEqual(reminders);
  });

  it('es idempotente: una cita ya cancelada se devuelve igual', () => {
    const cancelled = appointmentWith({
      status: 'cancelled',
      reminders: [reminderFor('r1', '2027-03-28T08:00:00.000Z', 'cancelled')],
    });

    expect(cancelAppointment(cancelled)).toBe(cancelled);
  });

  it('cancela también una cita confirmed y una ya empezada', () => {
    expect(cancelAppointment(appointmentWith({ status: 'confirmed' })).status).toBe('cancelled');
    expect(cancelAppointment(appointmentWith({ startsAt: new Date('2020-01-01T00:00:00.000Z') })).status).toBe(
      'cancelled',
    );
  });

  it('no modifica el agregado original', () => {
    const original = appointmentWith({});

    cancelAppointment(original);

    expect(original.status).toBe('scheduled');
    expect(original.reminders[0]?.status).toBe('pending');
  });
});
