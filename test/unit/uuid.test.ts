import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isUuid } from '../../src/domain/uuid.js';

describe('isUuid', () => {
  it('acepta un UUID', () => {
    expect(isUuid(randomUUID())).toBe(true);
  });

  it.each(['', 'abc', '1234', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'])('rechaza %j', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
