# T12 · Pasadas concurrentes y envíos en vuelo

Estado: pendiente
Depende de: T11, T08, T09

## Historia

Como operador del servicio, quiero poder lanzar varias pasadas a la vez, como si hubiera varias instancias, sin que ningún recordatorio se envíe dos veces, para poder escalar horizontalmente con seguridad.

## Criterios de aceptación

- [ ] Con N recordatorios pendientes y 5 pasadas lanzadas en paralelo, cada recordatorio se envía una vez: `/admin/requests` muestra una sola petición por recordatorio y la suma de `processed` es N.
- [ ] Si una pasada pierde el claim porque caducó su lease, no sobrescribe el resultado que guardó otra (guardado condicionado a `claim_token`).
- [ ] El lease se calcula con el `now()` de Postgres, no con la hora del servicio: mover el reloj con `PUT /test/clock` no libera ni bloquea claims.
- [ ] Si un recordatorio en vuelo falla y su cita se canceló entretanto, o se reprogramó y él ya no es el vigente (`for_starts_at != starts_at`), queda `cancelled` en lugar de reintentarse.
- [ ] La misma comprobación se aplica al reclamar un reintento.
- [ ] Si un recordatorio en vuelo tiene éxito tras una cancelación o reprogramación, queda `sent` (ADR 0001).

## Notas para el implementador

- Para el test de concurrencia, crea muchos recordatorios (p. ej. 30 citas) con el reloj fijado y lanza las pasadas con `Promise.all` sobre la API real.
- Para el caso en vuelo, inyecta en un test de aplicación un `MessageProvider` falso que se bloquee hasta que el test cancele la cita.

## Registro

_(lo rellena el implementador al terminar)_
