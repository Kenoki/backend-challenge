import { cancelAppointment, type Appointment } from '../domain/appointment.js';
import { NotFoundError } from '../domain/errors.js';
import type { UnitOfWork } from './ports/unit-of-work.js';

export type CancelAppointmentUseCase = (id: string) => Promise<Appointment>;

/**
 * Caso de uso: cancela una cita y sus recordatorios pendientes en una transacción, con la fila bloqueada.
 * Idempotente; 404 si no existe o el id no es UUID. Devuelve la cita tal como queda guardada
 * (un recordatorio en vuelo sigue `pending`).
 */
export function makeCancelAppointment(deps: { unitOfWork: UnitOfWork }): CancelAppointmentUseCase {
  return (id) =>
    deps.unitOfWork.run(async ({ appointments }) => {
      const appointment = await appointments.findByIdForUpdate(id);
      if (!appointment) throw new NotFoundError(`Cita no encontrada: ${JSON.stringify(id)}`);
      return appointments.save(cancelAppointment(appointment));
    });
}
