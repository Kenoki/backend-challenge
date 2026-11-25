# T10 · Pasada de envío

Estado: hecha
Depende de: T07

## Historia

Como clínica, quiero que una pasada envíe todos los recordatorios a los que les toca, para que los pacientes reciban su aviso sin intervención manual.

## Criterios de aceptación

- [x] `POST /jobs/reminders/run` trata todos los recordatorios `pending` con `next_attempt_at <= ahora` (hora del servicio) y responde 200 con `{ processed }` al terminar.
- [x] El texto enviado es exactamente `Hola {paciente}, te recordamos tu cita en {clínica} el {dd/MM/yyyy} a las {HH:mm}. Responde SI para confirmar o NO para cancelar.`, con fecha y hora locales de la clínica.
- [x] La llamada es `POST {PROVIDER_URL}/messages` con `Idempotency-Key` igual al `id` del recordatorio y cuerpo `{ to, text }`.
- [x] Si el proveedor responde 202 o 200, el recordatorio queda `sent`, con `sentAt` igual a la hora del servicio, `attempts` incrementado y un `sent_seq` monotónico.
- [x] Un paciente sin teléfono queda `skipped/no_phone`, y uno con `acceptsReminders: false` queda `skipped/opted_out`. En ambos casos no se llama al proveedor y `attempts` sigue en 0. Si se dan los dos, gana `no_phone`.
- [x] Si la cita ya empezó, el recordatorio queda `skipped/too_late` sin llamar al proveedor.
- [x] Los recordatorios cuya hora aún no ha llegado no se tocan.
- [x] `processed` cuenta todos los recordatorios que reclamó esa pasada, incluidos los `skipped`. Una pasada sin trabajo responde `{ processed: 0 }`.
- [x] Tests de integración contra el `provider` real (`/admin/messages`, `/admin/reset`).

## Notas para el implementador

- El reclamo sigue el ADR 0001:
  1. `UPDATE ... SET claim_token, claimed_until = now() + 60s WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50)`.
  2. Llamada al proveedor fuera de la transacción.
  3. Guardado del resultado condicionado a `claim_token`.
- Concurrencia limitada a unas 10 llamadas simultáneas por lote. Se repite mientras haya reclamables.
- El cliente del proveedor es un adaptador en `infrastructure` tras el puerto `MessageProvider`, que devuelve un resultado tipado: `delivered | retryable | rejected`. La traducción de códigos HTTP vive solo ahí.
- El texto del mensaje se compone con una función pura de dominio.

## Registro

- **Dominio puro**: `reminderText` (`src/domain/reminder-text.ts`, Luxon, fecha y hora locales de la clínica) y `decideDelivery` (`src/domain/delivery-decision.ts`, precedencia too_late > no_phone > opted_out; una cita con inicio igual a ahora cuenta como empezada). Mutation score del dominio: 100 %.
- **Puertos** (`src/application/ports/`): `MessageProvider.send({ idempotencyKey, to, text }) -> delivered | retryable | rejected` y `ReminderQueue` (`claimDue`, `recordAttempt`, `markSent`, `markSkipped`, `markFailed`, `scheduleRetry`). Toda escritura de la cola devuelve `false` si la pasada ya no es dueña del claim.
- **Adaptador HTTP** (`src/infrastructure/provider/http-message-provider.ts`): único sitio que traduce códigos (200/202 delivered; 4xx rejected; 5xx, red y timeout de 5 s con `AbortSignal.timeout` retryable).
- **Cola Kysely** (`src/infrastructure/db/kysely-reminder-queue.ts`): reclamo con un solo `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT n)` y lease `now() + 60 s` con el reloj de Postgres (ADR 0001); las escrituras llevan `WHERE id AND claim_token` y limpian el claim; `markSent` asigna `sent_seq = nextval('reminder_sent_seq')`.
- **Caso de uso** `makeRunReminders` (`src/application/run-reminders.ts`): bucle claimDue -> `forEachLimited` (concurrencia propia, 10) -> repetir hasta vacío; `processed` = reclamados. La llamada al proveedor va fuera de toda transacción y `recordAttempt` se hace antes de llamar.
- **HTTP**: `POST /jobs/reminders/run` -> 200 `{ processed }`. `PROVIDER_URL` en `main.ts` tiene por defecto `http://localhost:4010` (docker-compose la sobrescribe con `http://provider:4010`).
- **Vitest**: `fileParallelism: false`, porque los tests de integración comparten Postgres y la pasada trata todos los vencidos de la base; el test de la pasada hace `TRUNCATE` y `POST /admin/reset` en cada test.
- **Enganches**: T11 sustituye `PLACEHOLDER_RETRY_DELAY_MS` en `settle` por `nextAttempt(attempts, now)` y `markFailed` al agotar intentos. T12 añade en `settle` (rama no entregada) la comprobación de cita cancelada o recordatorio no vigente, y la misma comprobación al reclamar.
- **Desviación**: en `retryable` no basta con soltar el claim; el recordatorio seguiría vencido y el bucle lo reclamaría sin fin, así que `scheduleRetry` lo deja `pending` con `next_attempt_at = hora del servicio + 1 min` (provisional hasta T11).
- **Comprobado**: `lint`, `typecheck`, `test` (227 tests), `build`, `dup` (0 clones) y `mutation` en verde; prueba manual con `docker compose up --build -d api` (`{"processed":0}` antes de hora, `{"processed":1}` a la hora, cita con recordatorio `sent`, un mensaje en `/admin/messages` con `Idempotency-Key` igual al id del recordatorio).
