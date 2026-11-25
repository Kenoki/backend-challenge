import type { Patient } from '../../domain/patient.js';

export interface PatientRepository {
  save(patient: Patient): Promise<void>;
  /** Devuelve `null` si no existe, también cuando el id no es un UUID. */
  findById(id: string): Promise<Patient | null>;
}
