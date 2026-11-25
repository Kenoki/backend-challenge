import { describe, expect, it } from 'vitest';
import { createAppointment } from '../../src/domain/appointment.js';
import { ValidationError } from '../../src/domain/errors.js';
import { TimeZone } from '../../src/domain/time-zone.js';

const madrid = TimeZone.parse('Europe/Madrid');
const base = { id: 'a1', clinicId: 'c1', patientId: 'p1', timeZone: madrid, reminderId: 'r1' };

const create = (startsAt: string, now: string) =>
  createAppointment({ ...base, startsAt: new Date(startsAt), now: new Date(now) });

describe('createAppointment', () => {
  it('crea la cita scheduled con un recordatorio pending a la hora de envío', () => {
    const appointment = create('2027-03-28T08:00:00.000Z', '2027-03-01T00:00:00.000Z');

    expect(appointment).toEqual({
      id: 'a1',
      clinicId: 'c1',
      patientId: 'p1',
      startsAt: new Date('2027-03-28T08:00:00.000Z'),
      status: 'scheduled',
      reminders: [
        {
          id: 'r1',
          forStartsAt: new Date('2027-03-28T08:00:00.000Z'),
          scheduledFor: new Date('2027-03-27T09:00:00.000Z'),
          nextAttemptAt: new Date('2027-03-27T09:00:00.000Z'),
          status: 'pending',
          attempts: 0,
        },
      ],
    });
  });

  it('crea el recordatorio skipped too_late cuando no cabe antes de la cita', () => {
    // Cita a las 08:00 locales (07:00Z en invierno); ahora 22:00 locales la víspera.
    const appointment = create('2027-02-10T07:00:00.000Z', '2027-02-09T21:00:00.000Z');

    expect(appointment.reminders).toEqual([
      {
        id: 'r1',
        forStartsAt: new Date('2027-02-10T07:00:00.000Z'),
        scheduledFor: new Date('2027-02-10T08:00:00.000Z'),
        nextAttemptAt: new Date('2027-02-10T08:00:00.000Z'),
        status: 'skipped',
        skipReason: 'too_late',
        attempts: 0,
      },
    ]);
  });

  it('rechaza un inicio pasado o igual a ahora con ValidationError', () => {
    expect(() => create('2027-03-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z')).toThrow(ValidationError);
    expect(() => create('2027-02-28T00:00:00.000Z', '2027-03-01T00:00:00.000Z')).toThrow(ValidationError);
  });

  it('acepta un inicio un milisegundo en el futuro', () => {
    expect(() => create('2027-03-01T00:00:00.001Z', '2027-03-01T00:00:00.000Z')).not.toThrow();
  });
});
