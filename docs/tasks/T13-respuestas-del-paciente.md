# T13 · Respuestas del paciente

Estado: pendiente
Depende de: T10

## Historia

Como paciente, quiero responder SI o NO al recordatorio para confirmar o cancelar mi cita sin llamar a la clínica.

## Criterios de aceptación

- [ ] `POST /webhooks/inbound-messages { messageId, from, text, receivedAt }` responde 200 siempre que el cuerpo sea válido, se aplique o no el mensaje. Un cuerpo inválido responde 400.
- [ ] `SI`, `Sí`, `si.`, `  SÍ!` confirman. `NO`, `no`, `No!` cancelan. Cualquier otro texto (`sí gracias`, `vale`, vacío) se ignora.
- [ ] La cita destino es la del recordatorio `sent` más reciente (`sentAt` y, a igualdad, `sent_seq`) enviado a ese teléfono, entre las citas no empezadas y no canceladas, incluidas las `confirmed`. Si no hay ninguna, el mensaje se ignora.
- [ ] Con varios pacientes que comparten teléfono, se aplica a la cita del último recordatorio enviado a ese número.
- [ ] `SI` deja la cita `confirmed`; si ya lo estaba, no cambia nada.
- [ ] `NO` cancela la cita y su recordatorio `pending`, igual que T09.
- [ ] Un `messageId` repetido no se vuelve a procesar, aunque la primera vez se ignorara. También con dos avisos concurrentes con el mismo `messageId`.
- [ ] El "ahora" para decidir si la cita empezó es la hora del servicio.

## Notas para el implementador

- Función pura de dominio `parseReply(text) → 'confirm' | 'cancel' | null`:
  1. normalizar con NFD;
  2. quitar diacríticos;
  3. pasar a minúsculas;
  4. recortar los caracteres no alfanuméricos de los extremos;
  5. comparar con `si` o `no`.
- El `INSERT ... ON CONFLICT DO NOTHING` en `inbound_messages` va en la misma transacción que el efecto. Si no inserta, se responde 200 sin hacer nada.

## Registro

_(lo rellena el implementador al terminar)_
