# T06 · Hora de envío del recordatorio

Estado: hecha
Depende de: T01

## Historia

Como clínica, quiero que cada recordatorio salga a la misma hora local del día anterior a la cita, nunca de noche y nunca después de que empiece, para que el paciente lo reciba a una hora razonable y a tiempo.

## Criterios de aceptación

Función pura de dominio `planReminder({ startsAt, timeZone, now }) → { status: 'pending', scheduledFor } | { status: 'skipped', skipReason: 'too_late', scheduledFor }`, cubierta por tests unitarios:

- [x] Cita el domingo 28/03/2027 a las 10:00 en Madrid (cambio a horario de verano): sale el sábado 27/03/2027 a las 10:00 de Madrid, es decir, 09:00 UTC.
- [x] Cita el lunes 01/11/2027 a las 10:00 en Madrid (el día anterior es el de vuelta al horario de invierno): sale el domingo 31/10/2027 a las 10:00 locales, 09:00 UTC.
- [x] Cita en `Atlantic/Canary` a las 10:00: sale a las 10:00 locales de Canarias, una hora después que en la península.
- [x] Si la hora calculada cae en `[21:00, 09:00)`, se mueve a las 09:00 siguientes. Las 21:00 exactas se mueven y las 09:00 exactas no.
- [x] Si la hora calculada ya pasó respecto a `now`, se usa `now` y después se aplica la franja silenciosa.
- [x] Si el resultado es mayor o igual que `startsAt`, se devuelve `too_late`. Por ejemplo, una cita a las 08:00 creada la noche anterior a las 22:00 se movería a las 09:00, que ya es tarde.
- [x] Una hora del día anterior que no existe o que se repite por el cambio de hora cae en la franja silenciosa y se resuelve a las 09:00.

## Notas para el implementador

- Usa Luxon solo dentro de este módulo de dominio, con `DateTime.fromJSDate(x, { zone })` y `minus({ days: 1 })` (día de calendario, no 24 h).
- Sin I/O. Es la función con más lógica del proyecto y el objetivo principal de Stryker en T14.

## Registro

- Creado `src/domain/time-zone.ts`: value object `TimeZone` (`TimeZone.parse(name)`, valida con `IANAZone.isValidZone` y lanza si no es IANA). Se hace aquí para tener un único punto de validación; T04 puede reutilizarlo.
- Creado `src/domain/reminder-schedule.ts` con `planReminder({ startsAt, timeZone, now }) → ReminderPlan`. El resultado es una unión discriminada: `{ status: 'pending', scheduledFor }` o `{ status: 'skipped', skipReason: 'too_late', scheduledFor }`, de modo que `skipReason` no existe en un recordatorio pendiente. Es una función pura, sin I/O ni reloj propio.
- Algoritmo: día anterior con `minus({ days: 1 })` en la zona de la clínica (día de calendario, no 24 h), `DateTime.max` con `now`, y traslado a las 09:00:00.000 si cae en [21:00, 09:00). Si el resultado es >= `startsAt`, `too_late`. En `too_late`, `scheduledFor` es la hora calculada tras aplicar todas las reglas (queda como dato para diagnóstico).
- Horas inexistentes o repetidas: no hay código especial. Luxon las resuelve a una hora de madrugada (03:30 la inexistente, la primera 02:30 la repetida), que cae siempre en la franja silenciosa y por tanto acaba a las 09:00. Lo demuestran dos tests.
- Tests (TDD: cada bloque se vio fallar con un stub antes de implementar; TimeZone falló por aserción, planReminder devolvía `startsAt`): `test/unit/time-zone.test.ts` y `test/unit/reminder-schedule.test.ts` (fechas construidas con argumento explícito, tablas con `it.each`). Cubren cambios de hora de marzo y octubre, Canarias en verano e invierno, bordes 20:59/21:00/08:59/09:00, `now` posterior y dentro de la franja (con segundos y milisegundos), `too_late` por franja, por igualdad exacta y con `now` posterior al inicio, y hora inexistente/repetida.
- Comprobación: `npm test` (38 tests en verde), `npm run lint` y `npm run typecheck` sin errores.
