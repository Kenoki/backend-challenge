import { describe, expect, it } from 'vitest';
import { planReminder } from '../../src/domain/reminder-schedule.js';
import { TimeZone } from '../../src/domain/time-zone.js';

const madrid = TimeZone.parse('Europe/Madrid');
const canary = TimeZone.parse('Atlantic/Canary');
const longBefore = new Date('2027-01-01T00:00:00.000Z');

const pending = (iso: string) => ({ status: 'pending', scheduledFor: new Date(iso) });
const tooLate = (iso: string) => ({
  status: 'skipped',
  skipReason: 'too_late',
  scheduledFor: new Date(iso),
});

const plan = (startsAt: string, timeZone: TimeZone, now = longBefore) =>
  planReminder({ startsAt: new Date(startsAt), timeZone, now });

describe('planReminder: misma hora local del día anterior', () => {
  it.each([
    ['cambio a horario de verano (28/03/2027 10:00 Madrid)', '2027-03-28T08:00:00.000Z', '2027-03-27T09:00:00.000Z'],
    ['vuelta al horario de invierno (01/11/2027 10:00 Madrid)', '2027-11-01T09:00:00.000Z', '2027-10-31T09:00:00.000Z'],
    ['día normal de verano (17/06/2027 10:00 Madrid)', '2027-06-17T08:00:00.000Z', '2027-06-16T08:00:00.000Z'],
  ])('%s', (_name, startsAt, expected) => {
    expect(plan(startsAt, madrid)).toEqual(pending(expected));
  });

  it.each([
    ['verano', '2027-06-17T09:00:00.000Z', '2027-06-16T09:00:00.000Z', '2027-06-17T08:00:00.000Z', '2027-06-16T08:00:00.000Z'],
    ['invierno', '2027-12-17T10:00:00.000Z', '2027-12-16T10:00:00.000Z', '2027-12-17T09:00:00.000Z', '2027-12-16T09:00:00.000Z'],
  ])(
    'Canarias a las 10:00 locales (%s) sale una hora después que la península',
    (_season, canaryStart, canaryExpected, madridStart, madridExpected) => {
      expect(plan(canaryStart, canary)).toEqual(pending(canaryExpected));
      expect(plan(madridStart, madrid)).toEqual(pending(madridExpected));
    },
  );
});

describe('planReminder: franja silenciosa [21:00, 09:00)', () => {
  // Cita el 17/06/2027 a la hora local indicada (CEST = UTC+2); el cálculo cae el 16/06 a esa hora.
  it.each([
    ['20:59 se respeta', '2027-06-17T18:59:00.000Z', '2027-06-16T18:59:00.000Z'],
    ['21:00 exactas se mueven a las 09:00 del día siguiente', '2027-06-17T19:00:00.000Z', '2027-06-17T07:00:00.000Z'],
    ['23:30 se mueve a las 09:00 del día siguiente', '2027-06-17T21:30:00.000Z', '2027-06-17T07:00:00.000Z'],
    ['00:00 se mueve a las 09:00 del mismo día', '2027-06-16T22:00:00.000Z', '2027-06-16T07:00:00.000Z'],
    ['08:59 se mueve a las 09:00 del mismo día', '2027-06-17T06:59:00.000Z', '2027-06-16T07:00:00.000Z'],
    ['09:00 exactas se respetan', '2027-06-17T07:00:00.000Z', '2027-06-16T07:00:00.000Z'],
  ])('hora calculada a las %s', (_name, startsAt, expected) => {
    expect(plan(startsAt, madrid)).toEqual(pending(expected));
  });
});

describe('planReminder: nunca antes de ahora', () => {
  const startsAt = '2027-06-17T08:00:00.000Z'; // 10:00 Madrid; la hora base es 16/06 10:00 (08:00Z)

  it('usa now si la hora base ya pasó', () => {
    expect(plan(startsAt, madrid, new Date('2027-06-16T12:00:00.000Z'))).toEqual(
      pending('2027-06-16T12:00:00.000Z'),
    );
  });

  it('mantiene la hora base si now es anterior', () => {
    expect(plan(startsAt, madrid, new Date('2027-06-16T07:00:00.000Z'))).toEqual(
      pending('2027-06-16T08:00:00.000Z'),
    );
  });

  it.each([
    ['por la noche (21:30 locales)', '2027-06-16T19:30:45.123Z'],
    ['de madrugada (05:00 locales)', '2027-06-17T03:00:45.123Z'],
  ])('si now cae en la franja silenciosa %s, se mueve a las 09:00 siguientes', (_name, now) => {
    expect(plan(startsAt, madrid, new Date(now))).toEqual(pending('2027-06-17T07:00:00.000Z'));
  });
});

describe('planReminder: too_late', () => {
  it('cita a las 08:00 creada la noche anterior a las 22:00 no llega a tiempo', () => {
    expect(plan('2027-06-17T06:00:00.000Z', madrid, new Date('2027-06-16T20:00:00.000Z'))).toEqual(
      tooLate('2027-06-17T07:00:00.000Z'),
    );
  });

  it('si el resultado es exactamente el inicio de la cita, es too_late', () => {
    expect(plan('2027-06-17T07:00:00.000Z', madrid, new Date('2027-06-16T20:00:00.000Z'))).toEqual(
      tooLate('2027-06-17T07:00:00.000Z'),
    );
  });

  it('un instante antes del inicio todavía es pending', () => {
    expect(plan('2027-06-17T07:00:00.001Z', madrid, new Date('2027-06-16T20:00:00.000Z'))).toEqual(
      pending('2027-06-17T07:00:00.000Z'),
    );
  });

  it('con now posterior al inicio es too_late y scheduledFor es la hora calculada', () => {
    expect(plan('2027-06-17T08:00:00.000Z', madrid, new Date('2027-06-17T10:00:00.000Z'))).toEqual(
      tooLate('2027-06-17T10:00:00.000Z'),
    );
  });
});

describe('planReminder: horas locales inexistentes o repetidas por el cambio de hora', () => {
  it('si el día anterior a esa hora no existe (28/03/2027 02:30), sale a las 09:00 de ese día', () => {
    // Cita 29/03/2027 02:30 CEST = 00:30Z; el 28/03 a las 02:30 locales no existe.
    expect(plan('2027-03-29T00:30:00.000Z', madrid)).toEqual(pending('2027-03-28T07:00:00.000Z'));
  });

  it('si el día anterior a esa hora se repite (31/10/2027 02:30), sale a las 09:00 de ese día', () => {
    // Cita 01/11/2027 02:30 CET = 01:30Z; el 31/10 a las 02:30 locales ocurre dos veces.
    expect(plan('2027-11-01T01:30:00.000Z', madrid)).toEqual(pending('2027-10-31T08:00:00.000Z'));
  });
});
