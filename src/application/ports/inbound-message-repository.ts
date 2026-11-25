export type InboundOutcome = 'confirmed' | 'cancelled' | 'ignored';

/** Registro de las respuestas del paciente ya recibidas, para no procesar dos veces el mismo `messageId`. */
export interface InboundMessageRepository {
  /**
   * Registra el `messageId` con un resultado provisional `ignored`. Devuelve `false` si ya estaba registrado
   * (en tal caso no hay que hacer nada); si otra transacción lo está insertando, espera a que termine.
   * Solo dentro de `UnitOfWork.run`: el registro y el efecto se confirman o se revierten juntos.
   */
  record(message: { messageId: string; receivedAt: Date }): Promise<boolean>;
  /** Fija el resultado definitivo de un mensaje registrado en esta misma transacción. */
  setOutcome(messageId: string, outcome: InboundOutcome): Promise<void>;
}
