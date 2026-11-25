# T07 · Crear y consultar citas

Estado: pendiente
Depende de: T03, T05, T06

## Historia

Como integrador de ClinicSay, quiero crear una cita y consultarla con todos sus recordatorios, para que la cita quede programada para recordarse y pueda seguir su estado.

## Criterios de aceptación

- [ ] `POST /appointments { clinicId, patientId, startsAt }` responde 201 con `{ id, clinicId, patientId, startsAt, status: "scheduled", reminders: [ ... ] }`, con exactamente un recordatorio.
- [ ] El recordatorio tiene `scheduledFor` según T06, `attempts: 0`, `sentAt: null` y `status: "pending"` con `skipReason: null`, o bien `status: "skipped"` con `skipReason: "too_late"`.
- [ ] Un `startsAt` sin zona o inválido responde 400. Uno no futuro respecto al reloj del servicio también responde 400.
- [ ] Una clínica o un paciente inexistentes responden 404. Un paciente de otra clínica responde 400.
- [ ] Todas las fechas de la respuesta van en UTC con `Z`, aunque la petición traiga offset (`+02:00`).
- [ ] `GET /appointments/{id}` devuelve la cita con sus recordatorios del más antiguo al más nuevo. Un id inexistente o malformado responde 404.
- [ ] La cita y su recordatorio se guardan en la misma transacción.

## Notas para el implementador

- Entidad `Appointment` en el dominio con transiciones explícitas (`schedule`, `confirm`, `cancel`, `reschedule`). Solo `create` se usa aquí; el resto llega en T08, T09 y T13.
- El puerto `UnitOfWork` agrupa repositorios dentro de una transacción. Será necesario también en T08, T09, T10 y T13.

## Registro

_(lo rellena el implementador al terminar)_
