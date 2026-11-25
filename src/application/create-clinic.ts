import { randomUUID } from 'node:crypto';
import type { Clinic } from '../domain/clinic.js';
import { TimeZone } from '../domain/time-zone.js';
import type { ClinicRepository } from './ports/clinic-repository.js';

export interface CreateClinicInput {
  name: string;
  timezone: string;
}

export type CreateClinic = (input: CreateClinicInput) => Promise<Clinic>;

/** Caso de uso: da de alta una clínica. El id (UUID) lo genera el servicio. */
export function makeCreateClinic(deps: { clinics: ClinicRepository }): CreateClinic {
  return async ({ name, timezone }) => {
    const clinic: Clinic = { id: randomUUID(), name, timeZone: TimeZone.parse(timezone) };
    await deps.clinics.save(clinic);
    return clinic;
  };
}
