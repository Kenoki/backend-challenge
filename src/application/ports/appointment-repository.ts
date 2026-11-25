import type { Appointment } from '../../domain/appointment.js';

export interface AppointmentRepository {
  /** Devuelve el agregado con sus recordatorios (del más antiguo al más nuevo), o `null` si no existe o el id no es UUID. */
  findById(id: string): Promise<Appointment | null>;
  /**
   * Igual que `findById` pero bloquea la fila de la cita (`SELECT ... FOR UPDATE`) hasta el fin de la
   * transacción. Solo tiene sentido dentro de `UnitOfWork.run`; lo usarán reprogramar, cancelar y responder.
   */
  findByIdForUpdate(id: string): Promise<Appointment | null>;
  /** Inserta una cita nueva junto con todos sus recordatorios. */
  insert(appointment: Appointment): Promise<void>;
}
