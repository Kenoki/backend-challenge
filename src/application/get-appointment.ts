import type { Appointment } from '../domain/appointment.js';
import { NotFoundError } from '../domain/errors.js';
import type { AppointmentRepository } from './ports/appointment-repository.js';

export type GetAppointment = (id: string) => Promise<Appointment>;

/** Caso de uso: devuelve una cita con sus recordatorios; 404 si no existe o el id no es UUID. */
export function makeGetAppointment(deps: { appointments: AppointmentRepository }): GetAppointment {
  return async (id) => {
    const appointment = await deps.appointments.findById(id);
    if (!appointment) throw new NotFoundError(`Cita no encontrada: ${JSON.stringify(id)}`);
    return appointment;
  };
}
