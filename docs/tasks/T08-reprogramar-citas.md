# T08 · Reprogramar citas

Estado: pendiente
Depende de: T07

## Historia

Como clínica, quiero cambiar la hora de una cita y que el recordatorio se replanifique para la nueva hora, para que el paciente reciba el aviso correcto aunque ya hubiera recibido el anterior.

## Criterios de aceptación

- [ ] `PATCH /appointments/{id} { startsAt }` responde 200 con la cita actualizada.
- [ ] El recordatorio `pending` pasa a `cancelled` y se añade uno nuevo, calculado con T06 para la nueva hora. Los recordatorios `sent`, `failed` y `skipped` no cambian (ADR 0002).
- [ ] Si la cita estaba `confirmed`, vuelve a `scheduled`.
- [ ] Reprogramar a la misma hora se trata como una reprogramación normal.
- [ ] Los errores se comprueban en este orden: cuerpo inválido (400) → cita inexistente (404) → cita cancelada o ya empezada (409) → `startsAt` no futuro (400).
- [ ] Un recordatorio en vuelo (reclamado por una pasada) no se cancela al reprogramar (ADR 0001).
- [ ] Todo ocurre en una sola transacción.

## Registro

_(lo rellena el implementador al terminar)_
