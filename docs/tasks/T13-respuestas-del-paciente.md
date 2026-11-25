# T13 · Respuestas del paciente

Estado: hecha
Depende de: T10

## Historia

Como paciente, quiero responder SI o NO al recordatorio para confirmar o cancelar mi cita sin llamar a la clínica.

## Criterios de aceptación

- [x] `POST /webhooks/inbound-messages { messageId, from, text, receivedAt }` responde 200 siempre que el cuerpo sea válido, se aplique o no el mensaje. Un cuerpo inválido responde 400.
- [x] `SI`, `Sí`, `si.`, `  SÍ!` confirman. `NO`, `no`, `No!` cancelan. Cualquier otro texto (`sí gracias`, `vale`, vacío) se ignora.
- [x] La cita destino es la del recordatorio `sent` más reciente (`sentAt` y, a igualdad, `sent_seq`) enviado a ese teléfono, entre las citas no empezadas y no canceladas, incluidas las `confirmed`. Si no hay ninguna, el mensaje se ignora.
- [x] Con varios pacientes que comparten teléfono, se aplica a la cita del último recordatorio enviado a ese número.
- [x] `SI` deja la cita `confirmed`; si ya lo estaba, no cambia nada.
- [x] `NO` cancela la cita y su recordatorio `pending`, igual que T09.
- [x] Un `messageId` repetido no se vuelve a procesar, aunque la primera vez se ignorara. También con dos avisos concurrentes con el mismo `messageId`.
- [x] El "ahora" para decidir si la cita empezó es la hora del servicio.

## Notas para el implementador

- Función pura de dominio `parseReply(text) → 'confirm' | 'cancel' | null`:
  1. normalizar con NFD;
  2. quitar diacríticos;
  3. pasar a minúsculas;
  4. recortar los caracteres no alfanuméricos de los extremos;
  5. comparar con `si` o `no`.
- El `INSERT ... ON CONFLICT DO NOTHING` en `inbound_messages` va en la misma transacción que el efecto. Si no inserta, se responde 200 sin hacer nada.

## Registro

**Qué se hizo**

- Dominio puro: `parseReply` en `src/domain/patient-reply.ts` (NFD, quita marcas `\p{M}`, minúsculas, recorta lo que no sea `\p{L}\p{N}` en los extremos, compara con `si`/`no`). En `src/domain/appointment.ts`: `confirmAppointment` (scheduled a confirmed; confirmed y cancelled se devuelven tal cual) y `canReceiveReply(appointment, now)` (no cancelada y `startsAt > now`, la misma regla de "cita empezada" en un solo sitio). Cancelar reutiliza `cancelAppointment` (T09).
- Puertos: `InboundMessageRepository` (`record` y `setOutcome`) añadido al conjunto de repos del `UnitOfWork` como `inboundMessages`, y `AppointmentRepository.findReplyTargetId(phone, now)`. Lo puse en el repositorio de citas y no en un puerto aparte porque es una consulta sobre el agregado cita (une recordatorios y pacientes) y evita otro puerto de un solo método.
- Caso de uso `makeHandleInboundMessage({ unitOfWork, clock })` y ruta `POST /webhooks/inbound-messages` (`src/http/routes/webhooks.ts`), registrada en `UseCases`/`app.ts` y `main.ts`. Cuerpo Zod `{ messageId: string min(1), from: string, text: string, receivedAt: isoDateTimeWithZone }` (400 si no cumple); respuesta 200 `{ "status": "ok" }`.

**Cita destino (SQL equivalente)**

```sql
SELECT a.id FROM reminders r
JOIN appointments a ON a.id = r.appointment_id
JOIN patients p ON p.id = a.patient_id
WHERE r.status = 'sent' AND p.phone = $from AND a.status <> 'cancelled' AND a.starts_at > $now
ORDER BY r.sent_at DESC, r.sent_seq DESC NULLS LAST
LIMIT 1
```

Después `findByIdForUpdate(id)` y `canReceiveReply` otra vez dentro de la transacción (otra transacción pudo cancelar o reprogramar entre la búsqueda y el bloqueo). `$now` es `clock.now()`, no la hora real.

**Registro del messageId y un solo efecto**

```sql
INSERT INTO inbound_messages (message_id, received_at, outcome) VALUES ($1, $2, 'ignored')
ON CONFLICT (message_id) DO NOTHING
-- luego: UPDATE inbound_messages SET outcome = $o WHERE message_id = $1
```

Es lo primero que hace la transacción. Si no inserta (`numInsertedOrUpdatedRows` 0) se sale sin efecto. Con dos avisos concurrentes con el mismo `messageId`, el índice único de la clave primaria hace que el segundo `INSERT` espere a que la primera transacción confirme (o revierta); si confirma, no inserta y sale sin hacer nada; si revierte, el segundo inserta y aplica el efecto. El `INSERT`, el efecto y el `outcome` definitivo (`confirmed`/`cancelled`/`ignored`) van en la misma transacción. El `outcome` empieza como `ignored` provisional porque la decisión depende de la cita ya bloqueada y el `INSERT` tiene que ir antes para serializar los avisos repetidos. Los mensajes con otro `messageId` sobre la misma cita se serializan con `FOR UPDATE`; no hay ciclo de bloqueos (siempre `inbound_messages` y luego la cita).

**Comprobación**

- TDD: `test/unit/patient-reply.test.ts` (33 casos: variantes de T13, `confirmAppointment`, `canReceiveReply` con los límites del milisegundo) y `test/integration/inbound-messages.test.ts` (34 casos, contra `challenge_t13`, recordatorios `sent` preparados por SQL con `sent_at`/`sent_seq`, sin proveedor). Se vieron fallar antes por la importación inexistente.
- Con `DATABASE_URL=.../challenge_t13`: `npm run lint`, `typecheck`, `build` limpios; `npm test` 25 archivos, 308 tests en verde (incluye lo del otro implementador de T11 en ese momento); `npm run dup` 0 clones; `npm run mutation` 100 % (0 supervivientes; `patient-reply.ts` 22 mutantes muertos), `.stryker-tmp` borrado.

**Criterios**

1. 200 siempre con cuerpo válido / 400 inválido: tests de validación (sin messageId, vacío, sin from, text no string, receivedAt sin zona...) y 200 sin cita destino.
2. `SI`/`Sí`/`si.`/`  SÍ!` confirman, `NO`/`no`/`No!` cancelan, `sí gracias`/`vale`/vacío/`S I` se ignoran: unit + integración.
3. Cita destino por `sent_at` y `sent_seq`, entre no empezadas y no canceladas (incluidas `confirmed`): tests de empezada, cancelada, confirmed, cancelada más reciente (pasa a la anterior elegible) y recordatorio aún `pending`.
4. Mismo teléfono en varios pacientes: gana mayor `sent_at` aunque tenga menor `sent_seq`; a igualdad, mayor `sent_seq`.
5. `SI` confirma; sobre `confirmed` sigue igual: test.
6. `NO` cancela cita y su `pending` (cita reprogramada con `[sent, pending]` pasa a `[sent, cancelled]`) y también cancela una `confirmed`: tests.
7. `messageId` repetido sin reprocesar (primera vez ignorado y luego con cita destino; tras un efecto y una reprogramación) y dos avisos concurrentes con `Promise.all` (mismo texto: una fila y un efecto; texto distinto: una fila coherente con el estado final): tests.
8. "Ahora" es la hora del servicio: cita que empieza entre la hora real y la del `TestClock`, y cita que empieza justo en ese instante: tests.

**Desviaciones y dudas**

- Ninguna respecto al diseño. `receivedAt` solo se guarda; no interviene en ninguna decisión.
- Se compara `from` con `patients.phone` tal cual (ambos E.164); no se normaliza `from`. Un `from` con otro formato no encuentra cita destino y se ignora.
- Lint y typecheck globales pasaron enteros, incluso con el trabajo de T11 presente en el árbol.
