import type { AppointmentRepository } from './appointment-repository.js';
import type { ClinicRepository } from './clinic-repository.js';
import type { InboundMessageRepository } from './inbound-message-repository.js';
import type { PatientRepository } from './patient-repository.js';

export interface Repositories {
  clinics: ClinicRepository;
  patients: PatientRepository;
  appointments: AppointmentRepository;
  inboundMessages: InboundMessageRepository;
}

/** Ejecuta `work` en una transacción; los repositorios recibidos operan dentro de ella. Si `work` lanza, se revierte todo. */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}
