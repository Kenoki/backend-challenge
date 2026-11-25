import { describe, expect, it } from 'vitest';
import { TimeZone } from '../../src/domain/time-zone.js';

describe('TimeZone', () => {
  it.each(['Europe/Madrid', 'Atlantic/Canary', 'UTC'])('acepta la zona IANA %s', (name) => {
    expect(TimeZone.parse(name).name).toBe(name);
  });

  it.each(['', 'Madrid', 'Mars/Olympus', 'UTC+2', 'Europe/Madrid '])(
    'rechaza %j por no ser una zona IANA',
    (name) => {
      expect(() => TimeZone.parse(name)).toThrow(/zona horaria/i);
    },
  );
});
