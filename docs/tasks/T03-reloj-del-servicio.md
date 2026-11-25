# T03 · Reloj del servicio

Estado: hecha
Depende de: T01

## Historia

Como evaluador, quiero fijar la hora del servicio con `PUT /test/clock` cuando arranca con `CLOCK_MODE=test`, para poder probar citas, pasadas y webhooks en fechas concretas.

## Criterios de aceptación

- [x] Existe el puerto `Clock { now(): Date }` en `application`, con las implementaciones `SystemClock` y `TestClock` en `infrastructure/clock/`.
- [x] Con `CLOCK_MODE=test`, `PUT /test/clock { "now": "2027-03-27T08:00:00Z" }` responde 204 y, a partir de ahí, `clock.now()` devuelve ese instante congelado hasta el siguiente `PUT`.
- [x] Antes del primer `PUT`, el `TestClock` devuelve la hora real.
- [x] `PUT /test/clock` con un `now` sin zona, inválido o ausente responde 400 con `{ "error": ... }`.
- [x] Sin `CLOCK_MODE=test`, `PUT /test/clock` responde 404.
- [x] `main.ts` crea una única instancia de `Clock` y la inyecta en todo lo que necesita la hora.

## Notas para el implementador

- El esquema Zod de fecha con zona (`z.string().datetime({ offset: true })`) se define una sola vez en `http/` y se reutiliza en T07, T08 y T13.
- El middleware de errores de T01 debe traducir los fallos de validación Zod a 400 con `{ "error": ... }`. Si aún no existe, créalo aquí.

## Registro

- Tests primero (vistos fallar por módulo inexistente): `test/unit/test-clock.test.ts` (hora real antes de `set`, instante exacto y congelado tras `set`, segundo `set`, inmutabilidad de los `Date`) y `test/integration/test-clock.test.ts` (204 con `Z` y con `+02:00`, 400 sin zona/ausente/inválido/no texto con `{ error }`, 404 sin reloj inyectado).
- Puerto `Clock` en `src/application/ports/clock.ts`; `SystemClock` y `TestClock` (`set(at)`, guarda los milisegundos y devuelve siempre una copia nueva de `Date`) en `src/infrastructure/clock/`, el único sitio donde se permite `new Date()`.
- `isoDateTimeWithZone` en `src/http/schemas.ts` (`z.iso.datetime({ offset: true })` + transform a `Date`), una sola vez para T07, T08 y T13.
- Ruta `PUT /test/clock` en `src/http/routes/test-clock.ts`, con la interfaz mínima `SettableClock` definida en `http` para no importar de `infrastructure`. `createApp` recibe `testClock?` y solo entonces monta la ruta; sin él, el 404 final lo resuelve el handler existente. El 400 lo da el middleware de errores ya existente (ZodError).
- `main.ts`: una única variable `clock` (TestClock si `CLOCK_MODE=test`, si no SystemClock), lista para inyectarse en casos de uso futuros; se loguea el modo al arrancar.
- Comprobación: `npm run lint`, `typecheck`, `test` (50 tests) y `build` en verde. A mano con `docker compose up --build -d api`: `PUT /test/clock` con `Z` respondió 204 y sin zona 400 `{"error":"now: Invalid ISO datetime"}`; el log mostró `clockMode: test`. Después `docker compose stop api` (db sigue arriba).
- Nota: en los tests la "hora real" se toma de `performance.timeOrigin + performance.now()` para respetar la regla ESLint que prohíbe `Date.now()`.
