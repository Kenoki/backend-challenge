# T08 · Reprogramar citas

Estado: hecha
Depende de: T07

## Historia

Como clínica, quiero cambiar la hora de una cita y que el recordatorio se replanifique para la nueva hora, para que el paciente reciba el aviso correcto aunque ya hubiera recibido el anterior.

## Criterios de aceptación

- [x] `PATCH /appointments/{id} { startsAt }` responde 200 con la cita actualizada.
- [x] El recordatorio `pending` pasa a `cancelled` y se añade uno nuevo, calculado con T06 para la nueva hora. Los recordatorios `sent`, `failed` y `skipped` no cambian (ADR 0002).
- [x] Si la cita estaba `confirmed`, vuelve a `scheduled`.
- [x] Reprogramar a la misma hora se trata como una reprogramación normal.
- [x] Los errores se comprueban en este orden: cuerpo inválido (400) → cita inexistente (404) → cita cancelada o ya empezada (409) → `startsAt` no futuro (400).
- [x] Un recordatorio en vuelo (reclamado por una pasada) no se cancela al reprogramar (ADR 0001).
- [x] Todo ocurre en una sola transacción.

## Registro

- Tests primero (vistos fallar: los unit por función inexistente, los de integración por módulo inexistente): `test/unit/appointment-transitions.test.ts` (`rescheduleAppointment`: pendiente -> `[cancelled, pending]`, enviado -> `[sent, pending]` y el enviado se conserva por identidad, failed/skipped intactos, historial mixto, confirmed -> scheduled, `too_late` en el nuevo, misma hora, inmutabilidad, 409 cancelada, 409 ya empezada incluido `startsAt <= now` y el límite de +1 ms, 400 no futuro y que el 409 va antes) y `test/integration/appointments.test.ts` (HTTP + Postgres real + `TestClock`: forma exacta de la respuesta y GET idéntico; `[sent, pending]`, failed y skipped preparados por SQL; confirmed por SQL; too_late; misma hora; 400 de esquema (sin campo, sin zona, inválido, no string) incluso con id inexistente; 404 inexistente/no-UUID aun con `startsAt` pasado; 409 cancelada y ya empezada aun con `startsAt` pasado; 400 no futuro sin modificar nada; recordatorio en vuelo; claim caducado; atomicidad).
- Dominio (`src/domain/appointment.ts`): `rescheduleAppointment(appointment, { startsAt, timeZone, now, newReminderId })` puro y sin mutar: 409 si cancelada o `startsAt` actual <= now, luego `assertStartsInFuture` (400); pone a `cancelled` los `pending`, conserva el resto, añade el recordatorio nuevo y vuelve a `scheduled`. Se extrajo `newReminder(id, input)` (usa `planReminder`), compartido con `createAppointment`.
- **Recordatorio en vuelo.** El dominio no conoce claims: `cancelPending` expresa solo la intención "cancelar los pendientes". La decisión de qué es "en vuelo" vive en un único sitio, `KyselyAppointmentRepository.cancelIfNotInFlight`: `UPDATE reminders SET status='cancelled' WHERE id=? AND status='pending' AND (claim_token IS NULL OR claimed_until <= now())`, con el `now()` de Postgres (ADR 0001). Un recordatorio en vuelo sigue `pending` aunque el agregado en memoria lo marcara cancelado, por eso `save` devuelve el agregado releído de la base y la respuesta HTTP refleja el estado real. T12 completará el caso del fallo en vuelo.
- Puerto: `AppointmentRepository.save(appointment): Promise<Appointment>` (actualiza `starts_at`/`status`, inserta los recordatorios nuevos y aplica la cancelación guardada a los `cancelled` existentes; solo dentro de `UnitOfWork.run` tras `findByIdForUpdate`). `insert` comparte con `save` el método privado `insertReminder`.
- Caso de uso `makeRescheduleAppointment({ unitOfWork, clock })` (`src/application/reschedule-appointment.ts`): en una transacción, `findByIdForUpdate` (404) -> carga la clínica para la zona horaria -> dominio (409 -> 400) -> `save`. HTTP: `PATCH /appointments/:id` en `src/http/routes/appointments.ts` (Zod valida el cuerpo antes que nada, de ahí que el 400 de esquema gane al 404); cableado en `app.ts` y `main.ts`.
- Verificación: tests unitarios e integración de citas en verde, `tsc --noEmit` y `eslint` limpios (ver registro de T09 para la verificación completa y la prueba manual).
