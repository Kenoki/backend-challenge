import { IANAZone } from 'luxon';
import { ValidationError } from './errors.js';

/** Zona horaria IANA válida (p. ej. `Europe/Madrid`). Única puerta de entrada de zonas al dominio. */
export class TimeZone {
  private constructor(readonly name: string) {}

  static parse(name: string): TimeZone {
    if (!IANAZone.isValidZone(name)) {
      throw new ValidationError(`Zona horaria no válida: ${JSON.stringify(name)}`);
    }
    return new TimeZone(name);
  }
}
