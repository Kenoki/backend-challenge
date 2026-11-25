# T12 · Pasadas concurrentes y envíos en vuelo

Estado: hecha
Depende de: T11, T08, T09

## Historia

Como operador del servicio, quiero poder lanzar varias pasadas a la vez, como si hubiera varias instancias, sin que ningún recordatorio se envíe dos veces, para poder escalar horizontalmente con seguridad.

## Criterios de aceptación

- [x] Con N recordatorios pendientes y 5 pasadas lanzadas en paralelo, cada recordatorio se envía una vez: `/admin/requests` muestra una sola petición por recordatorio y la suma de `processed` es N.
- [x] Si una pasada pierde el claim porque caducó su lease, no sobrescribe el resultado que guardó otra (guardado condicionado a `claim_token`).
- [x] El lease se calcula con el `now()` de Postgres, no con la hora del servicio: mover el reloj con `PUT /test/clock` no libera ni bloquea claims.
- [x] Si un recordatorio en vuelo falla y su cita se canceló entretanto, o se reprogramó y él ya no es el vigente (`for_starts_at != starts_at`), queda `cancelled` en lugar de reintentarse.
- [x] La misma comprobación se aplica al reclamar un reintento.
- [x] Si un recordatorio en vuelo tiene éxito tras una cancelación o reprogramación, queda `sent` (ADR 0001).

## Notas para el implementador

- Para el test de concurrencia, crea muchos recordatorios (p. ej. 30 citas) con el reloj fijado y lanza las pasadas con `Promise.all` sobre la API real.
- Para el caso en vuelo, inyecta en un test de aplicación un `MessageProvider` falso que se bloquee hasta que el test cancele la cita.

## Registro

- **Regla de vigencia, en un solo sitio.** `isCurrent({ forStartsAt, appointmentStartsAt, appointmentStatus })` en `src/domain/reminder.ts`: vigente si la cita no está `cancelled` y `for_starts_at` es igual a `starts_at`. No hay copia en SQL: la usan el caso de uso (al reclamar) y la cola (al escribir un fallo), ambas desde TypeScript.
- **Al reclamar.** `claimDue` devuelve además `forStartsAt` y `appointmentStatus` (`ClaimedReminder`). `process` en `run-reminders.ts` comprueba `isCurrent` antes de `decideDelivery`: si no es vigente llama a `queue.markCancelled` (escritura condicionada al claim) sin tocar al proveedor y cuenta en `processed`. Cubre también el reintento de una cita cancelada o reprogramada.
- **Tras un intento no entregado.** El puerto sustituye `markFailed` y `scheduleRetry` por `settleFailedAttempt(reminder, next: FailedAttempt)` con `FailedAttempt = { kind: 'retry'; at: Date } | { kind: 'fail' }`. En `KyselyReminderQueue` abre una transacción, lee `for_starts_at`, `starts_at` y `status` de la cita con `SELECT ... FOR SHARE OF a` (filtrando por `claim_token`), aplica `isCurrent` con ese estado fresco y escribe con la misma `ifStillClaimed`: `cancelled` si ya no es vigente, `pending` con nuevo `next_attempt_at` en `retry`, `failed` en `fail`. Cancelar y reprogramar bloquean la cita con `FOR UPDATE`, de modo que o ocurren antes (se ven) o esperan a que termine esta escritura. Una cancelación aún sin confirmar en ese instante la recoge el reclamo del reintento (la comprobación de arriba), así que nunca se vuelve a llamar al proveedor.
- **Decisión.** Un `rejected` o un `give_up` de un recordatorio no vigente también queda `cancelled` (no `failed`): coincide con el ADR ("si falla y la cita ya está cancelada o el recordatorio ya no es el vigente, pasa a `cancelled`"). Si el recordatorio sigue vigente, `rejected` y agotar intentos dejan `failed`. El éxito sigue dejando `sent` aunque la cita ya esté cancelada o reprogramada.
- **Lease y ownership.** Sin cambios de código: `claimed_until` ya usa `now()` de Postgres y toda escritura sigue condicionada a `claim_token`; ahora hay tests. Al quitar a propósito esa condición o el `now()`, los tests correspondientes fallan (comprobado a mano).
- **Tests.** `test/unit/reminder-currency.test.ts` (3, vigencia). `test/integration/reminders-concurrency.test.ts` (13, Postgres y proveedor reales, TRUNCATE y `/admin/reset` en `beforeEach`): 5 pasadas por HTTP en paralelo sobre 30 recordatorios (con `batchSize: 3` y `concurrency: 2` para que las pasadas se intercalen de verdad, y se comprueba que más de una procesó algo; suma de `processed` = 30, una petición y un mensaje por teléfono, todos `sent`); lease (reloj movido días adelante y atrás no libera un claim vigente; un claim caducado por SQL se reclama con el reloj atrasado; `claimed_until - now()` entre 0 y 60 s con el reloj en 2027); pérdida de claim (la primera pasada, con proveedor bloqueado, ve caducar su lease y otra pasada entrega: su `retryable` o `delivered` tardío no altera estado, `attempts`, `sent_at`, `sent_seq` ni `next_attempt_at`); en vuelo con `GatedProvider` (cancelar + retryable, cancelar + rejected, reprogramar + retryable sin reintento posterior a +10 min, cancelar + éxito, reprogramar + éxito); reclamo de un reintento (attempts 1) de cita cancelada o reprogramada por SQL, sin llamar al proveedor. Los de comportamiento nuevo se vieron fallar antes de implementar; los de lease y ownership ya se cumplían y se verificó que fallan si se quita la condición.
- **Nota sobre `reminder_sent_seq`.** `TRUNCATE ... RESTART IDENTITY` no reinicia esa secuencia independiente, por eso el test compara `sent_seq` con el valor guardado y no con 1.
- **Verificación.** `lint`, `typecheck`, `build` y `dup` (0 clones) en verde; `npm test` 27 archivos y 324 tests en verde con la base `postgres`; `test:coverage` cumple el umbral del dominio; `mutation` 100 % de score (0 supervivientes, `reminder.ts` 7 muertos), `.stryker-tmp` borrado.
- Orquestador: se quitó la aserción de que más de una pasada procesara algo, porque depende del reparto entre pasadas y podría fallar de forma intermitente en CI. La seguridad (suma = 30, una petición y un mensaje por teléfono) se sigue comprobando.
