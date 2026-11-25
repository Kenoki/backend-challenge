import type { Clinic } from '../../domain/clinic.js';

export interface ClinicRepository {
  save(clinic: Clinic): Promise<void>;
  /** Devuelve `null` si no existe, también cuando el id no es un UUID. */
  findById(id: string): Promise<Clinic | null>;
}
