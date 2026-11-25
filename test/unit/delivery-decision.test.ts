import { describe, expect, it } from 'vitest';
import { decideDelivery } from '../../src/domain/delivery-decision.js';

const now = new Date('2027-03-01T10:00:00.000Z');
const future = new Date('2027-03-02T10:00:00.000Z');
const base = { appointmentStartsAt: future, now, phone: '+34600111222', acceptsReminders: true };

describe('decideDelivery', () => {
  it('envía al teléfono del paciente cuando todo está en orden', () => {
    expect(decideDelivery(base)).toEqual({ kind: 'send', to: '+34600111222' });
  });

  it('descarta too_late si la cita ya empezó (inicio == ahora cuenta como empezada)', () => {
    expect(decideDelivery({ ...base, appointmentStartsAt: now })).toEqual({ kind: 'skip', reason: 'too_late' });
    expect(decideDelivery({ ...base, appointmentStartsAt: new Date('2027-03-01T09:59:59.999Z') })).toEqual({
      kind: 'skip',
      reason: 'too_late',
    });
  });

  it('envía si la cita empieza un milisegundo después de ahora', () => {
    expect(decideDelivery({ ...base, appointmentStartsAt: new Date('2027-03-01T10:00:00.001Z') })).toEqual({
      kind: 'send',
      to: '+34600111222',
    });
  });

  it('descarta no_phone si el paciente no tiene teléfono', () => {
    expect(decideDelivery({ ...base, phone: null })).toEqual({ kind: 'skip', reason: 'no_phone' });
  });

  it('descarta opted_out si el paciente no acepta recordatorios', () => {
    expect(decideDelivery({ ...base, acceptsReminders: false })).toEqual({ kind: 'skip', reason: 'opted_out' });
  });

  it('precedencia: no_phone gana a opted_out', () => {
    expect(decideDelivery({ ...base, phone: null, acceptsReminders: false })).toEqual({
      kind: 'skip',
      reason: 'no_phone',
    });
  });

  it('precedencia: too_late gana a no_phone y a opted_out', () => {
    expect(
      decideDelivery({ ...base, appointmentStartsAt: now, phone: null, acceptsReminders: false }),
    ).toEqual({ kind: 'skip', reason: 'too_late' });
  });
});
