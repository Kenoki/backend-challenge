import { describe, expect, it } from 'vitest';
import { reminderText } from '../../src/domain/reminder-text.js';
import { TimeZone } from '../../src/domain/time-zone.js';

const text = (startsAt: string, timeZone: string) =>
  reminderText({
    patientName: 'Ana',
    clinicName: 'Clínica Sol',
    startsAt: new Date(startsAt),
    timeZone: TimeZone.parse(timeZone),
  });

const message = (date: string, time: string) =>
  `Hola Ana, te recordamos tu cita en Clínica Sol el ${date} a las ${time}. Responde SI para confirmar o NO para cancelar.`;

describe('reminderText', () => {
  it('compone el texto exacto con la fecha y hora locales de la clínica', () => {
    expect(text('2027-06-17T08:00:00.000Z', 'Europe/Madrid')).toBe(message('17/06/2027', '10:00'));
  });

  it('rellena con ceros a la izquierda día, mes y hora', () => {
    expect(text('2027-02-03T07:05:00.000Z', 'Europe/Madrid')).toBe(message('03/02/2027', '08:05'));
  });

  it.each([
    ['invierno en Madrid (UTC+1)', '2027-01-15T09:30:00.000Z', 'Europe/Madrid', '15/01/2027', '10:30'],
    ['verano en Madrid (UTC+2)', '2027-07-15T09:30:00.000Z', 'Europe/Madrid', '15/07/2027', '11:30'],
    ['invierno en Canarias (UTC+0)', '2027-01-15T09:30:00.000Z', 'Atlantic/Canary', '15/01/2027', '09:30'],
    ['verano en Canarias (UTC+1)', '2027-07-15T09:30:00.000Z', 'Atlantic/Canary', '15/07/2027', '10:30'],
  ])('%s', (_name, startsAt, zone, date, time) => {
    expect(text(startsAt, zone)).toBe(message(date, time));
  });

  it('usa el día local cuando el instante UTC cae en otro día', () => {
    expect(text('2027-06-17T22:30:00.000Z', 'Europe/Madrid')).toBe(message('18/06/2027', '00:30'));
  });
});
