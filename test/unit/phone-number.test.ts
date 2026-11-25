import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/errors.js';
import { PhoneNumber } from '../../src/domain/phone-number.js';

describe('PhoneNumber', () => {
  it.each(['+34600111222', '+12025550123', '+12345678', '+123456789012345'])(
    'acepta el E.164 %s',
    (value) => {
      expect(PhoneNumber.parse(value).value).toBe(value);
    },
  );

  it.each([
    '',
    '600111222',
    '+0034600111222',
    '+34',
    '+0600111222',
    '+3460011122a',
    '+1234567',
    '+1234567890123456',
    ' +34600111222',
    '+34 600111222',
  ])('rechaza %j por no ser E.164', (value) => {
    expect(() => PhoneNumber.parse(value)).toThrow(ValidationError);
  });
});
