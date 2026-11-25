# Envío único con lease e Idempotency-Key por recordatorio

Puede haber varias pasadas a la vez y el proveedor puede responder 504 o no responder aunque haya entregado el mensaje. Cada pasada reclama recordatorios con `FOR UPDATE SKIP LOCKED` y un lease (`claim_token` + `claimed_until`), llama al proveedor **fuera** de la transacción y guarda el resultado solo si sigue siendo dueña del claim. La `Idempotency-Key` es el `id` del recordatorio, estable entre intentos, así que un reintento tras un 504 nunca entrega dos veces.

## Considered Options

- Mantener la transacción y el lock abiertos durante la llamada: descartado porque bloquea conexiones hasta 5 s por mensaje y no sobrevive a la caída de una instancia.
- Una key por intento: descartado porque tras un 504 el reintento volvería a entregar el mensaje.

## Consequences

- Si una instancia muere a mitad de un envío, el lease expira y otra pasada reintenta con la misma key, sin duplicar el mensaje.
- Reprogramar o cancelar no toca los recordatorios reclamados en ese momento: si el envío en vuelo tiene éxito, queda `sent`. Si falla y la cita ya está cancelada o el recordatorio ya no es el vigente, pasa a `cancelled` en vez de reintentarse; la misma comprobación se hace al reclamar un reintento.
- `claimed_until` se calcula con el `now()` real de Postgres, no con la hora del servicio. Si usara esta última, mover el reloj con `PUT /test/clock` bloquearía claims (hacia atrás) o permitiría robar envíos en vuelo (hacia delante).
