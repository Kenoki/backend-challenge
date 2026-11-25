import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../domain/errors.js';
import type { Patient } from '../domain/patient.js';
import { PhoneNumber } from '../domain/phone-number.js';
import type { ClinicRepository } from './ports/clinic-repository.js';
import type { PatientRepository } from './ports/patient-repository.js';

export interface CreatePatientInput {
  clinicId: string;
  name: string;
  phone: string | null;
  acceptsReminders: boolean;
}

export type CreatePatient = (input: CreatePatientInput) => Promise<Patient>;

/** Caso de uso: da de alta un paciente. Valida el teléfono (400) antes de comprobar la clínica (404). */
export function makeCreatePatient(deps: {
  clinics: ClinicRepository;
  patients: PatientRepository;
}): CreatePatient {
  return async ({ clinicId, name, phone, acceptsReminders }) => {
    const parsedPhone = phone === null ? null : PhoneNumber.parse(phone);
    if (!(await deps.clinics.findById(clinicId))) {
      throw new NotFoundError(`Clínica no encontrada: ${JSON.stringify(clinicId)}`);
    }
    const patient: Patient = { id: randomUUID(), clinicId, name, phone: parsedPhone, acceptsReminders };
    await deps.patients.save(patient);
    return patient;
  };
}
