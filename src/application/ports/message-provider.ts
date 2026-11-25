export interface SendMessage {
  /** Estable entre intentos del mismo recordatorio: el proveedor no entrega dos veces la misma key. */
  readonly idempotencyKey: string;
  readonly to: string;
  readonly text: string;
}

/** Resultado de un intento: entregado, fallo transitorio que puede reintentarse, o rechazo definitivo. */
export type DeliveryOutcome = { readonly kind: 'delivered' } | { readonly kind: 'retryable' } | { readonly kind: 'rejected' };

/** Servicio externo que entrega mensajes. Nunca lanza por fallos del proveedor: los traduce a `DeliveryOutcome`. */
export interface MessageProvider {
  send(message: SendMessage): Promise<DeliveryOutcome>;
}
