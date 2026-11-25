# T07 · Crear y consultar citas

Estado: hecha
Depende de: T03, T05, T06

## Historia

Como integrador de ClinicSay, quiero crear una cita y consultarla con todos sus recordatorios, para que la cita quede programada para recordarse y pueda seguir su estado.

## Criterios de aceptación

- [x] `POST /appointments { clinicId, patientId, startsAt }` responde 201 con `{ id, clinicId, patientId, startsAt, status: "scheduled", reminders: [ ... ] }`, con exactamente un recordatorio.
- [x] El recordatorio tiene `scheduledFor` según T06, `attempts: 0`, `sentAt: null` y `status: "pending"` con `skipReason: null`, o bien `status: "skipped"` con `skipReason: "too_late"`.
- [x] Un `startsAt` sin zona o inválido responde 400. Uno no futuro respecto al reloj del servicio también responde 400.
- [x] Una clínica o un paciente inexistentes responden 404. Un paciente de otra clínica responde 400.
- [x] Todas las fechas de la respuesta van en UTC con `Z`, aunque la petición traiga offset (`+02:00`).
- [x] `GET /appointments/{id}` devuelve la cita con sus recordatorios del más antiguo al más nuevo. Un id inexistente o malformado responde 404.
- [x] La cita y su recordatorio se guardan en la misma transacción.

## Notas para el implementador

- Entidad `Appointment` en el dominio con transiciones explícitas (`schedule`, `confirm`, `cancel`, `reschedule`). Solo `create` se usa aquí; el resto llega en T08, T09 y T13.
- El puerto `UnitOfWork` agrupa repositorios dentro de una transacción. Será necesario también en T08, T09, T10 y T13.

## Registro

- Tests primero (vistos fallar por módulo inexistente): `test/unit/appointment.test.ts` (`createAppointment`: forma completa con recordatorio pending, `forStartsAt`/`nextAttemptAt` = `scheduledFor`, too_late, inicio pasado/igual a ahora -> `ValidationError`, +1 ms válido) y `test/integration/appointments.test.ts` (HTTP + Postgres real + `TestClock` fijado en cada test: 201 con forma exacta para `2027-03-28T10:00:00+02:00` en Madrid y reloj 2027-03-01 -> `startsAt` `2027-03-28T08:00:00.000Z`, `scheduledFor` `2027-03-27T09:00:00.000Z`; too_late con reloj 22:00 locales la víspera de una cita a las 08:00; 400 sin zona/inválido/fecha imposible/no string/pasado/igual a now; 400 de fecha antes que 404; 404 clínica o paciente inexistentes o no-UUID; 400 paciente de otra clínica; GET igual al POST, 404 inexistente y no-UUID, orden por `seq`; atomicidad; `findByIdForUpdate`).
- Dominio: `src/domain/reminder.ts` (`Reminder` unión discriminada por `status`: `sentAt` solo en `sent`, `skipReason` solo en `skipped`, no pueden existir en otros estados) y `src/domain/appointment.ts` (`Appointment` agregado con `reminders` ordenados, `assertStartsInFuture`, `createAppointment({ id, clinicId, patientId, startsAt, timeZone, now, reminderId })` puro, con `planReminder`). Las transiciones de T08/T09/T13 no se han implementado. `assertStartsInFuture` es la única definición de "futuro" y la usan el caso de uso (para que el 400 vaya antes que los 404) y la fábrica.
- Puertos: `AppointmentRepository` (`findById`, `findByIdForUpdate`, `insert`) y `UnitOfWork.run(work: (repos: { clinics, patients, appointments }) => ...)` en `application/ports`. Implementaciones Kysely: `kysely-appointment-repository.ts` (usa `isUuid`, lee reminders `ORDER BY seq`, mapea filas a la unión y falla si la fila viola la invariante) y `kysely-unit-of-work.ts` (`db.transaction().execute`, repos construidos sobre la transacción). Sin cambios en la migración.
- Casos de uso: `makeCreateAppointment({ unitOfWork, clock })` (400 no futuro -> 404 clínica/paciente -> 400 otra clínica; ids con `randomUUID`; cita y recordatorio en una transacción) y `makeGetAppointment({ appointments })` (`NotFoundError`). HTTP: `src/http/routes/appointments.ts` (Zod con `isoDateTimeWithZone`; presentación con `toISOString()`, `sentAt`/`skipReason` a `null` cuando no aplican). `createApp` extrae `registerUseCaseRoutes` para no superar la complejidad ESLint. `main.ts` inyecta el `clock` ya existente y el `KyselyUnitOfWork`.
- Bloqueo preparado para T08/T09/T13: `findByIdForUpdate` hace `SELECT ... FOR UPDATE` sobre la fila de la cita dentro de `UnitOfWork.run`; esas tareas lo usarán y añadirán a `AppointmentRepository` un `save`/`update` del agregado. T08/T09 también podrán actualizar recordatorios por la misma transacción.
- Atomicidad: el test envuelve el `UnitOfWork` real y hace que `insert` lance después de haber insertado cita y recordatorio; comprueba por SQL que no queda ninguna fila de ninguna de las dos tablas (respuesta 500). Demuestra que la frontera transaccional está en `UnitOfWork.run` y que cualquier excepción revierte todo; el diseño lo garantiza porque `insert` usa los repos creados sobre `trx`.
- Duda/decisión: un recordatorio `skipped` guarda `nextAttemptAt = scheduledFor` (la columna es NOT NULL); T10 no lo tratará porque solo reclama `pending`.
- Verificación: `npm run lint`, `typecheck`, `npm test` (124 tests), `npm run build` en verde. Manual con `docker compose up --build -d api`: `PUT /test/clock` 2027-03-01 -> 204; POST /clinics, POST /patients, `POST /appointments` con `2027-03-28T10:00:00+02:00` -> 201 `{"id":"f25c2fce-...","clinicId":"4e4fd2f7-...","patientId":"48feb3f0-...","startsAt":"2027-03-28T08:00:00.000Z","status":"scheduled","reminders":[{"id":"91fe8ca0-...","scheduledFor":"2027-03-27T09:00:00.000Z","status":"pending","attempts":0,"sentAt":null,"skipReason":null}]}`; GET -> 200 idéntico; GET `abc` -> 404; `startsAt` sin zona -> 400. `docker compose stop api` (db sigue arriba).
