import { describe, expect, it } from 'vitest';
import { isCurrent } from '../../src/domain/reminder.js';

const STARTS = new Date('2027-06-17T08:00:00.000Z');

describe('isCurrent', () => {
  it('es vigente si la cita no está cancelada y su hora es la que tenía al crearse el recordatorio', () => {
    expect(isCurrent({ forStartsAt: STARTS, appointmentStartsAt: new Date(STARTS), appointmentStatus: 'scheduled' })).toBe(true);
    expect(isCurrent({ forStartsAt: STARTS, appointmentStartsAt: new Date(STARTS), appointmentStatus: 'confirmed' })).toBe(true);
  });

  it('no es vigente si la cita está cancelada', () => {
    expect(isCurrent({ forStartsAt: STARTS, appointmentStartsAt: STARTS, appointmentStatus: 'cancelled' })).toBe(false);
  });

  it('no es vigente si la cita se reprogramó, aunque solo sea por un milisegundo', () => {
    const later = new Date(STARTS.getTime() + 1);
    expect(isCurrent({ forStartsAt: STARTS, appointmentStartsAt: later, appointmentStatus: 'scheduled' })).toBe(false);
    const earlier = new Date(STARTS.getTime() - 1);
    expect(isCurrent({ forStartsAt: STARTS, appointmentStartsAt: earlier, appointmentStatus: 'scheduled' })).toBe(false);
  });
});
