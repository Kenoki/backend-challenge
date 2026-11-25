import { ValidationError } from './errors.js';

const E164 = /^\+[1-9]\d{7,14}$/;

/** Teléfono en formato E.164 (p. ej. `+34600111222`). Única puerta de entrada de teléfonos al dominio. */
export class PhoneNumber {
  private constructor(readonly value: string) {}

  static parse(value: string): PhoneNumber {
    if (!E164.test(value)) {
      throw new ValidationError(`Teléfono no válido (se espera E.164): ${JSON.stringify(value)}`);
    }
    return new PhoneNumber(value);
  }
}
