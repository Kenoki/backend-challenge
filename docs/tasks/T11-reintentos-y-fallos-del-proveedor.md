# T11 · Reintentos y fallos del proveedor

Estado: pendiente
Depende de: T10

## Historia

Como clínica, quiero que los fallos transitorios del proveedor se reintenten sin que el paciente reciba el mensaje dos veces, para que el recordatorio llegue aunque el proveedor falle.

## Criterios de aceptación

- [ ] Un 503, cualquier otro 5xx, un 504, un error de red o más de 5 s sin respuesta se consideran fallos reintentables. El recordatorio sigue `pending` con `next_attempt_at` igual a la hora del servicio + 1 min tras el primer fallo y + 5 min tras el segundo.
- [ ] Un 422, un 400 o cualquier otro 4xx dejan el recordatorio `failed` sin reintentos.
- [ ] Si el tercer intento falla, el recordatorio queda `failed` con `attempts: 3`.
- [ ] Los reintentos no esperan a que termine la franja silenciosa.
- [ ] Si la cita ya empezó al llegar el reintento, el recordatorio queda `skipped/too_late` sin llamar al proveedor.
- [ ] Con la regla `lost-response` del proveedor (entrega y responde 504), el reintento recibe 200 `duplicate`, el recordatorio queda `sent` y `/admin/messages` muestra un solo mensaje.
- [ ] Una pasada a la misma hora del servicio tras un fallo no reintenta; hay que avanzar el reloj 1 min.
- [ ] Tests de integración usando `/admin/rules` (`unavailable`, `lost-response`, `reject`).

## Notas para el implementador

- La política de reintentos (`[1 min, 5 min]`, máximo 3 intentos) es una función pura de dominio: `nextAttempt(attempts, now) → Date | 'give_up'`.
- El timeout de 5 s se implementa con `AbortSignal.timeout(5000)` en el adaptador.

## Registro

_(lo rellena el implementador al terminar)_
