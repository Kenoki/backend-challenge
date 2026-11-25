import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/errors.js';
import { PhoneNumber } from '../../src/domain/phone-number.js';
import { planReminder } from '../../src/domain/reminder-schedule.js';
import { TimeZone } from '../../src/domain/time-zone.js';
import { isUuid } from '../../src/domain/uuid.js';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('isUuid: el id debe ser un UUID completo', () => {
  it('acepta un UUID en mayúsculas', () => {
    expect(isUuid(VALID_UUID.toUpperCase())).toBe(true);
  });

  it.each([`${VALID_UUID}x`, `${VALID_UUID}0`, `x${VALID_UUID}`, ` ${VALID_UUID}`, `${VALID_UUID}\n`])(
    'rechaza un UUID con texto sobrante: %j',
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});

describe('mensajes de error de validación', () => {
  it('el teléfono inválido se nombra en el mensaje para poder diagnosticar', () => {
    expect(() => PhoneNumber.parse('600111222')).toThrowError(ValidationError);
    expect(() => PhoneNumber.parse('600111222')).toThrowError(/E\.164.*600111222/);
  });

  it('la zona horaria inválida se nombra en el mensaje para poder diagnosticar', () => {
    expect(() => TimeZone.parse('Mars/Olympus')).toThrowError(ValidationError);
    expect(() => TimeZone.parse('Mars/Olympus')).toThrowError(/Mars\/Olympus/);
  });
});

describe('planReminder: hora local de las 09:xx', () => {
  it('conserva los minutos de un recordatorio que cae entre las 09:00 y las 09:59 (fuera de la franja silenciosa)', () => {
    const plan = planReminder({
      startsAt: new Date('2027-06-17T07:30:00.000Z'), // 09:30 Madrid (verano, UTC+2)
      timeZone: TimeZone.parse('Europe/Madrid'),
      now: new Date('2027-06-01T00:00:00.000Z'),
    });

    expect(plan).toEqual({
      status: 'pending',
      scheduledFor: new Date('2027-06-16T07:30:00.000Z'), // 09:30 Madrid del día anterior
    });
  });
});
