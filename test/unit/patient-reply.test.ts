import { describe, expect, it } from 'vitest';
import { canReceiveReply, cancelAppointment, confirmAppointment, type Appointment } from '../../src/domain/appointment.js';
import { parseReply } from '../../src/domain/patient-reply.js';

describe('parseReply', () => {
  it.each(['SI', 'Sí', 'si.', '  SÍ!', '¡Sí!', 'sí', 'Si', '\tsi\n'])('%j confirma', (text) => {
    expect(parseReply(text)).toBe('confirm');
  });

  it.each(['NO', 'no', 'No!', ' ¿No? ', 'nO.'])('%j cancela', (text) => {
    expect(parseReply(text)).toBe('cancel');
  });

  it.each(['sí gracias', 'vale', '', '   ', '!!!', 'S I', 'sino', 'nos', 'ssi', 'sí, no', 'yes', '1'])(
    '%j se ignora',
    (text) => {
      expect(parseReply(text)).toBeNull();
    },
  );

  it('los signos interiores no se recortan', () => {
    expect(parseReply('s.i')).toBeNull();
  });
});

const base: Appointment = {
  id: 'a',
  clinicId: 'c',
  patientId: 'p',
  startsAt: new Date('2027-03-01T10:00:00Z'),
  status: 'scheduled',
  reminders: [],
};

describe('confirmAppointment', () => {
  it('scheduled pasa a confirmed y conserva el resto', () => {
    expect(confirmAppointment(base)).toEqual({ ...base, status: 'confirmed' });
  });

  it('confirmed se devuelve tal cual', () => {
    const confirmed: Appointment = { ...base, status: 'confirmed' };
    expect(confirmAppointment(confirmed)).toBe(confirmed);
  });

  it('una cancelada no se confirma', () => {
    const cancelled = cancelAppointment(base);
    expect(confirmAppointment(cancelled)).toBe(cancelled);
  });
});

describe('canReceiveReply', () => {
  const now = new Date('2027-03-01T09:00:00Z');

  it('scheduled y confirmed no empezadas la reciben', () => {
    expect(canReceiveReply(base, now)).toBe(true);
    expect(canReceiveReply({ ...base, status: 'confirmed' }, now)).toBe(true);
  });

  it('una cancelada no', () => {
    expect(canReceiveReply({ ...base, status: 'cancelled' }, now)).toBe(false);
  });

  it('una que empieza justo ahora (o antes) no', () => {
    expect(canReceiveReply(base, base.startsAt)).toBe(false);
    expect(canReceiveReply(base, new Date('2027-03-01T10:00:01Z'))).toBe(false);
  });

  it('una que empieza un milisegundo después sí', () => {
    expect(canReceiveReply(base, new Date('2027-03-01T09:59:59.999Z'))).toBe(true);
  });
});
