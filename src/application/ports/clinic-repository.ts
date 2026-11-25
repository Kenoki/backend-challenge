import type { Clinic } from '../../domain/clinic.js';

export interface ClinicRepository {
  save(clinic: Clinic): Promise<void>;
  findById(id: string): Promise<Clinic | null>;
}
