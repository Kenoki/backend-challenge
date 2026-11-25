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
  /**
   * Persiste el agregado modificado de una cita existente (estado, inicio y recordatorios) y devuelve cómo queda guardado.
   * Inserta los recordatorios nuevos y aplica a los `cancelled` la cancelación de pendientes, que NO alcanza a un
   * recordatorio en vuelo (reclamado con `claim_token` y `claimed_until > now()` de la base): sigue `pending` (ADR 0001).
   * Solo dentro de `UnitOfWork.run`, tras `findByIdForUpdate`.
   */
  save(appointment: Appointment): Promise<Appointment>;
  /**
   * Id de la cita destino de una respuesta desde `phone`: la del recordatorio `sent` con mayor (`sent_at`, `sent_seq`)
   * enviado a ese teléfono, entre las citas no canceladas y con inicio posterior a `now`. `null` si no hay ninguna.
   * No bloquea: quien la use debe bloquear la cita con `findByIdForUpdate` y volver a comprobarla.
   */
  findReplyTargetId(phone: string, now: Date): Promise<string | null>;
}
