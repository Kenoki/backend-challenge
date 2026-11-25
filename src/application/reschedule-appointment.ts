import { randomUUID } from 'node:crypto';
import { rescheduleAppointment, type Appointment } from '../domain/appointment.js';
import { NotFoundError } from '../domain/errors.js';
import type { Clock } from './ports/clock.js';
import type { UnitOfWork } from './ports/unit-of-work.js';

export type RescheduleAppointmentUseCase = (input: { id: string; startsAt: Date }) => Promise<Appointment>;

/**
 * Caso de uso: reprograma una cita en una transacción, con la fila bloqueada.
 * Orden de errores (el 400 de esquema ya lo dio la capa HTTP): cita inexistente (404) -> cancelada o ya empezada (409)
 * -> startsAt no futuro (400). Devuelve la cita tal como queda guardada (un recordatorio en vuelo sigue `pending`).
 */
export function makeRescheduleAppointment(deps: { unitOfWork: UnitOfWork; clock: Clock }): RescheduleAppointmentUseCase {
  return ({ id, startsAt }) =>
    deps.unitOfWork.run(async ({ clinics, appointments }) => {
      const appointment = await appointments.findByIdForUpdate(id);
      if (!appointment) throw new NotFoundError(`Cita no encontrada: ${JSON.stringify(id)}`);
      const clinic = await clinics.findById(appointment.clinicId);
      if (!clinic) throw new Error(`Clínica inexistente para la cita ${id}`);
      const rescheduled = rescheduleAppointment(appointment, {
        startsAt,
        timeZone: clinic.timeZone,
        now: deps.clock.now(),
        newReminderId: randomUUID(),
      });
      return appointments.save(rescheduled);
    });
}
