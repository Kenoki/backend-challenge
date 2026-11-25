/** Error esperado del negocio; la capa HTTP lo traduce a un código según su subclase. */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** El dato recibido no es válido (400). */
export class ValidationError extends DomainError {}

/** El recurso referenciado no existe (404). */
export class NotFoundError extends DomainError {}

/** La operación choca con el estado actual (409). */
export class ConflictError extends DomainError {}
