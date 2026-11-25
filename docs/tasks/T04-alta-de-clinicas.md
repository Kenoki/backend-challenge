# T04 · Alta de clínicas

Estado: pendiente
Depende de: T02

## Historia

Como integrador de ClinicSay, quiero dar de alta una clínica con su zona horaria, para que sus citas y recordatorios usen la hora local correcta.

## Criterios de aceptación

- [ ] `POST /clinics { name, timezone }` responde 201 con `{ id, name, timezone }`; el `id` es un UUID generado por el servicio.
- [ ] Un `name` vacío o ausente responde 400.
- [ ] Una `timezone` que no es IANA válida (`Europe/Madird`, `GMT+1 inventada`, vacía) responde 400.
- [ ] `Europe/Madrid` y `Atlantic/Canary` se aceptan.
- [ ] Un JSON malformado responde 400 con `{ "error": ... }`.

## Notas para el implementador

- La validez de la zona horaria ya vive en el value object `TimeZone` (`src/domain/time-zone.ts`, creado en T06). Reutilízalo, no dupliques la validación.
- Caso de uso `CreateClinic` en `application`, repositorio `ClinicRepository` (puerto) con su implementación Kysely en `infrastructure`.

## Registro

_(lo rellena el implementador al terminar)_
