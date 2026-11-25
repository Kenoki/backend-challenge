# T09 · Cancelar citas

Estado: pendiente
Depende de: T07

## Historia

Como clínica, quiero cancelar una cita y que no se envíe su recordatorio pendiente, para no avisar de citas que ya no existen.

## Criterios de aceptación

- [ ] `POST /appointments/{id}/cancel` responde 200 con la cita en `status: "cancelled"`.
- [ ] El recordatorio `pending` pasa a `cancelled`; el resto de recordatorios no cambia.
- [ ] Cancelar una cita ya cancelada responde 200 y no modifica nada (es idempotente).
- [ ] Cancelar una cita que ya empezó está permitido.
- [ ] Un id inexistente o malformado responde 404.
- [ ] Un recordatorio en vuelo no se cancela aquí; lo resuelve T12.

## Registro

_(lo rellena el implementador al terminar)_
