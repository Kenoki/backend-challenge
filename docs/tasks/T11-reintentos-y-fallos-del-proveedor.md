# T11 · Reintentos y fallos del proveedor

Estado: hecha
Depende de: T10

## Historia

Como clínica, quiero que los fallos transitorios del proveedor se reintenten sin que el paciente reciba el mensaje dos veces, para que el recordatorio llegue aunque el proveedor falle.

## Criterios de aceptación

- [x] Un 503, cualquier otro 5xx, un 504, un error de red o más de 5 s sin respuesta se consideran fallos reintentables. El recordatorio sigue `pending` con `next_attempt_at` igual a la hora del servicio + 1 min tras el primer fallo y + 5 min tras el segundo.
- [x] Un 422, un 400 o cualquier otro 4xx dejan el recordatorio `failed` sin reintentos.
- [x] Si el tercer intento falla, el recordatorio queda `failed` con `attempts: 3`.
- [x] Los reintentos no esperan a que termine la franja silenciosa.
- [x] Si la cita ya empezó al llegar el reintento, el recordatorio queda `skipped/too_late` sin llamar al proveedor.
- [x] Con la regla `lost-response` del proveedor (entrega y responde 504), el reintento recibe 200 `duplicate`, el recordatorio queda `sent` y `/admin/messages` muestra un solo mensaje.
- [x] Una pasada a la misma hora del servicio tras un fallo no reintenta; hay que avanzar el reloj 1 min.
- [x] Tests de integración usando `/admin/rules` (`unavailable`, `lost-response`, `reject`).

## Notas para el implementador

- La política de reintentos (`[1 min, 5 min]`, máximo 3 intentos) es una función pura de dominio: `nextAttempt(attempts, now) → Date | 'give_up'`.
- El timeout de 5 s se implementa con `AbortSignal.timeout(5000)` en el adaptador.

## Registro

- **Dominio**: `src/domain/retry-policy.ts` con `nextAttempt(attemptsMade, failedAt): Date | 'give_up'` y `MAX_ATTEMPTS`. Las esperas viven en un único array `[1 min, 5 min]` y el máximo de 3 intentos se deriva de su longitud. La espera se calcula desde la hora del fallo (la del servicio), no desde la hora prevista.
- **Caso de uso**: en `settle` de `run-reminders.ts`, `retryable` llama a `nextAttempt(reminder.attempts + 1, clock.now())` (el reclamo trae los intentos previos a `recordAttempt`, por eso el +1) y hace `scheduleRetry` o `markFailed` si devuelve `give_up`. `rejected` (4xx) sigue en `markFailed`. Se elimina `PLACEHOLDER_RETRY_DELAY_MS`. No hizo falta tocar el puerto ni `KyselyReminderQueue`.
- **Sin cambios necesarios** para dos criterios: los reintentos no miran la franja silenciosa (la franja solo se aplica al programar el recordatorio, T06) y la cita ya empezada se resuelve en `decideDelivery` (`too_late`), que se ejecuta también al reclamar un reintento. Ambos quedan cubiertos por test.
- **Tests (TDD, vistos fallar antes)**: `test/unit/retry-policy.test.ts` (1.º y 2.º fallo con límites exactos +60000 y +300000 ms, `give_up` al 3.º y más allá, inmutabilidad de la fecha) y `test/integration/reminders-retry.test.ts` (Postgres y proveedor reales, `TestClock`): 503 → pending con `next_attempt_at` +1 min, misma hora y +59,999 s no reintentan, +1 min → sent con attempts 2; segundo fallo → +5 min desde ese fallo; tres 503 → failed con attempts 3 y exactamente 3 peticiones; 504 `lost-response` → mismo Idempotency-Key, 200 duplicate, sent y un solo mensaje; 422 → failed con una petición; reintento a las 21:00:30 locales (tras fallo a las 20:59:30) se envía; reintento con la cita ya empezada → skipped/too_late sin nueva petición.
- **Timeout de 5 s**: lo cubre el test del adaptador de T10 (`http-message-provider.test.ts`); no se duplica.
- **Verificación**: `reminders-run.test.ts` sigue en verde sin cambios. Stryker: 100 % en `src/domain` (0 supervivientes en `retry-policy.ts`). `jscpd`: 0 clones. Lint, typecheck y build de lo mío limpios; `npm test` y typecheck/lint globales fallaban solo por el trabajo a medio hacer de T13 (`inbound-messages.test.ts`) en ese momento.
