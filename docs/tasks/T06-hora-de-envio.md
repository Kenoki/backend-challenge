# T06 · Hora de envío del recordatorio

Estado: pendiente
Depende de: T01

## Historia

Como clínica, quiero que cada recordatorio salga a la misma hora local del día anterior a la cita, nunca de noche y nunca después de que empiece, para que el paciente lo reciba a una hora razonable y a tiempo.

## Criterios de aceptación

Función pura de dominio `planReminder({ startsAt, timeZone, now }) → { scheduledFor } | { skipped: 'too_late', scheduledFor }`, cubierta por tests unitarios:

- [ ] Cita el domingo 28/03/2027 a las 10:00 en Madrid (cambio a horario de verano): sale el sábado 27/03/2027 a las 10:00 de Madrid, es decir, 09:00 UTC.
- [ ] Cita el lunes 01/11/2027 a las 10:00 en Madrid (el día anterior es el de vuelta al horario de invierno): sale el domingo 31/10/2027 a las 10:00 locales, 09:00 UTC.
- [ ] Cita en `Atlantic/Canary` a las 10:00: sale a las 10:00 locales de Canarias, una hora después que en la península.
- [ ] Si la hora calculada cae en `[21:00, 09:00)`, se mueve a las 09:00 siguientes. Las 21:00 exactas se mueven y las 09:00 exactas no.
- [ ] Si la hora calculada ya pasó respecto a `now`, se usa `now` y después se aplica la franja silenciosa.
- [ ] Si el resultado es mayor o igual que `startsAt`, se devuelve `too_late`. Por ejemplo, una cita a las 08:00 creada la noche anterior a las 22:00 se movería a las 09:00, que ya es tarde.
- [ ] Una hora del día anterior que no existe o que se repite por el cambio de hora cae en la franja silenciosa y se resuelve a las 09:00.

## Notas para el implementador

- Usa Luxon solo dentro de este módulo de dominio, con `DateTime.fromJSDate(x, { zone })` y `minus({ days: 1 })` (día de calendario, no 24 h).
- Sin I/O. Es la función con más lógica del proyecto y el objetivo principal de Stryker en T14.

## Registro

_(lo rellena el implementador al terminar)_
