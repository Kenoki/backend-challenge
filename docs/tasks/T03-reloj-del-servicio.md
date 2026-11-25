# T03 · Reloj del servicio

Estado: pendiente
Depende de: T01

## Historia

Como evaluador, quiero fijar la hora del servicio con `PUT /test/clock` cuando arranca con `CLOCK_MODE=test`, para poder probar citas, pasadas y webhooks en fechas concretas.

## Criterios de aceptación

- [ ] Existe el puerto `Clock { now(): Date }` en `application`, con las implementaciones `SystemClock` y `TestClock` en `infrastructure/clock/`.
- [ ] Con `CLOCK_MODE=test`, `PUT /test/clock { "now": "2027-03-27T08:00:00Z" }` responde 204 y, a partir de ahí, `clock.now()` devuelve ese instante congelado hasta el siguiente `PUT`.
- [ ] Antes del primer `PUT`, el `TestClock` devuelve la hora real.
- [ ] `PUT /test/clock` con un `now` sin zona, inválido o ausente responde 400 con `{ "error": ... }`.
- [ ] Sin `CLOCK_MODE=test`, `PUT /test/clock` responde 404.
- [ ] `main.ts` crea una única instancia de `Clock` y la inyecta en todo lo que necesita la hora.

## Notas para el implementador

- El esquema Zod de fecha con zona (`z.string().datetime({ offset: true })`) se define una sola vez en `http/` y se reutiliza en T07, T08 y T13.
- El middleware de errores de T01 debe traducir los fallos de validación Zod a 400 con `{ "error": ... }`. Si aún no existe, créalo aquí.

## Registro

_(lo rellena el implementador al terminar)_
