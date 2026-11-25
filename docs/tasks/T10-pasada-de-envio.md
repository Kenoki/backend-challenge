# T10 · Pasada de envío

Estado: pendiente
Depende de: T07

## Historia

Como clínica, quiero que una pasada envíe todos los recordatorios a los que les toca, para que los pacientes reciban su aviso sin intervención manual.

## Criterios de aceptación

- [ ] `POST /jobs/reminders/run` trata todos los recordatorios `pending` con `next_attempt_at <= ahora` (hora del servicio) y responde 200 con `{ processed }` al terminar.
- [ ] El texto enviado es exactamente `Hola {paciente}, te recordamos tu cita en {clínica} el {dd/MM/yyyy} a las {HH:mm}. Responde SI para confirmar o NO para cancelar.`, con fecha y hora locales de la clínica.
- [ ] La llamada es `POST {PROVIDER_URL}/messages` con `Idempotency-Key` igual al `id` del recordatorio y cuerpo `{ to, text }`.
- [ ] Si el proveedor responde 202 o 200, el recordatorio queda `sent`, con `sentAt` igual a la hora del servicio, `attempts` incrementado y un `sent_seq` monotónico.
- [ ] Un paciente sin teléfono queda `skipped/no_phone`, y uno con `acceptsReminders: false` queda `skipped/opted_out`. En ambos casos no se llama al proveedor y `attempts` sigue en 0. Si se dan los dos, gana `no_phone`.
- [ ] Si la cita ya empezó, el recordatorio queda `skipped/too_late` sin llamar al proveedor.
- [ ] Los recordatorios cuya hora aún no ha llegado no se tocan.
- [ ] `processed` cuenta todos los recordatorios que reclamó esa pasada, incluidos los `skipped`. Una pasada sin trabajo responde `{ processed: 0 }`.
- [ ] Tests de integración contra el `provider` real (`/admin/messages`, `/admin/reset`).

## Notas para el implementador

- El reclamo sigue el ADR 0001:
  1. `UPDATE ... SET claim_token, claimed_until = now() + 60s WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50)`.
  2. Llamada al proveedor fuera de la transacción.
  3. Guardado del resultado condicionado a `claim_token`.
- Concurrencia limitada a unas 10 llamadas simultáneas por lote. Se repite mientras haya reclamables.
- El cliente del proveedor es un adaptador en `infrastructure` tras el puerto `MessageProvider`, que devuelve un resultado tipado: `delivered | retryable | rejected`. La traducción de códigos HTTP vive solo ahí.
- El texto del mensaje se compone con una función pura de dominio.

## Registro

_(lo rellena el implementador al terminar)_
