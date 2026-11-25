# T09 · Cancelar citas

Estado: hecha
Depende de: T07

## Historia

Como clínica, quiero cancelar una cita y que no se envíe su recordatorio pendiente, para no avisar de citas que ya no existen.

## Criterios de aceptación

- [x] `POST /appointments/{id}/cancel` responde 200 con la cita en `status: "cancelled"`.
- [x] El recordatorio `pending` pasa a `cancelled`; el resto de recordatorios no cambia.
- [x] Cancelar una cita ya cancelada responde 200 y no modifica nada (es idempotente).
- [x] Cancelar una cita que ya empezó está permitido.
- [x] Un id inexistente o malformado responde 404.
- [x] Un recordatorio en vuelo no se cancela aquí; lo resuelve T12.

## Registro

- Tests primero (vistos fallar por función/módulo inexistente): `test/unit/appointment-transitions.test.ts` (`cancelAppointment`: cita y pendiente a `cancelled`, sent/failed/skipped intactos, idempotente (devuelve la misma instancia), confirmed, ya empezada, sin mutar) y `test/integration/appointments.test.ts` (HTTP + Postgres real: 200 con la cita cancelada y GET idéntico, `sent` intacto, doble cancelación con la misma respuesta y sin filas nuevas, cita ya empezada, confirmed, 404 inexistente y no-UUID, recordatorio en vuelo simulado por SQL con `claim_token` y `claimed_until = now() + 1 min` que sigue `pending` mientras la cita pasa a `cancelled`, atomicidad).
- Dominio: `cancelAppointment(appointment)` en `src/domain/appointment.ts`: ya cancelada -> la misma instancia; si no, `status: 'cancelled'` y `cancelPending` (el mismo helper que reprogramar). No exige que la cita no haya empezado.
- Caso de uso `makeCancelAppointment({ unitOfWork })` (`src/application/cancel-appointment.ts`): transacción, `findByIdForUpdate` (404) -> dominio -> `save`, que devuelve la cita tal como queda guardada. HTTP: `POST /appointments/:id/cancel` -> 200; cableado en `app.ts` y `main.ts`.
- En vuelo: igual que en T08, la decisión vive solo en `KyselyAppointmentRepository.cancelIfNotInFlight` (`UPDATE ... WHERE status='pending' AND (claim_token IS NULL OR claimed_until <= now())`); aquí el recordatorio en vuelo no se cancela y T12 resolverá su fallo posterior.
- Duplicación evitada: los tests de atomicidad de T08 y T09 comparten `failingAfterSaveUow` en el test de integración.
- Verificación: `npx eslint src test`, `tsc --noEmit`, `vitest run` (177 tests) y `npm run build` en verde (`npm run lint` global falla por el directorio `.stryker-tmp` que deja T14 a medias, no por este código). Manual con `docker compose up --build -d api` (reloj fijado a 2027-03-01): `PATCH` a `2027-04-10T10:00:00+02:00` -> 200 con `[cancelled, pending]` y `startsAt` `2027-04-10T08:00:00.000Z`; `POST .../cancel` -> 200 con ambos `cancelled`; segunda cancelación -> 200; `PATCH` sobre la cancelada -> 409; `POST /appointments/abc/cancel` -> 404; `docker compose stop api` (db sigue arriba).
