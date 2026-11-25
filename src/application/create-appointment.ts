import { randomUUID } from 'node:crypto';
import { assertStartsInFuture, createAppointment, type Appointment } from '../domain/appointment.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { Clock } from './ports/clock.js';
import type { UnitOfWork } from './ports/unit-of-work.js';

export interface CreateAppointmentInput {
  clinicId: string;
  patientId: string;
  startsAt: Date;
}

export type CreateAppointmentUseCase = (input: CreateAppointmentInput) => Promise<Appointment>;

/**
 * Caso de uso: crea una cita y su primer recordatorio en una transacción.
 * Orden de errores: startsAt no futuro (400) -> clínica o paciente inexistentes (404) -> paciente de otra clínica (400).
 */
export function makeCreateAppointment(deps: { unitOfWork: UnitOfWork; clock: Clock }): CreateAppointmentUseCase {
  return async ({ clinicId, patientId, startsAt }) => {
    const now = deps.clock.now();
    assertStartsInFuture(startsAt, now);
    return deps.unitOfWork.run(async ({ clinics, patients, appointments }) => {
      const clinic = await clinics.findById(clinicId);
      if (!clinic) throw new NotFoundError(`Clínica no encontrada: ${JSON.stringify(clinicId)}`);
      const patient = await patients.findById(patientId);
      if (!patient) throw new NotFoundError(`Paciente no encontrado: ${JSON.stringify(patientId)}`);
      if (patient.clinicId !== clinic.id) {
        throw new ValidationError('El paciente no pertenece a la clínica indicada');
      }
      const appointment = createAppointment({
        id: randomUUID(),
        clinicId,
        patientId,
        startsAt,
        timeZone: clinic.timeZone,
        now,
        reminderId: randomUUID(),
      });
      await appointments.insert(appointment);
      return appointment;
    });
  };
}
