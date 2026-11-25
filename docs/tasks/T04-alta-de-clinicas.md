# T04 · Alta de clínicas

Estado: hecha
Depende de: T02

## Historia

Como integrador de ClinicSay, quiero dar de alta una clínica con su zona horaria, para que sus citas y recordatorios usen la hora local correcta.

## Criterios de aceptación

- [x] `POST /clinics { name, timezone }` responde 201 con `{ id, name, timezone }`; el `id` es un UUID generado por el servicio.
- [x] Un `name` vacío o ausente responde 400.
- [x] Una `timezone` que no es IANA válida (`Europe/Madird`, `GMT+1 inventada`, vacía) responde 400.
- [x] `Europe/Madrid` y `Atlantic/Canary` se aceptan.
- [x] Un JSON malformado responde 400 con `{ "error": ... }`.

## Notas para el implementador

- La validez de la zona horaria ya vive en el value object `TimeZone` (`src/domain/time-zone.ts`, creado en T06). Reutilízalo, no dupliques la validación.
- Caso de uso `CreateClinic` en `application`, repositorio `ClinicRepository` (puerto) con su implementación Kysely en `infrastructure`.

## Registro

- Tests primero (vistos fallar por módulo inexistente): `test/integration/clinics.test.ts` (HTTP + Postgres real: 201 con Europe/Madrid y Atlantic/Canary, id UUID distinto por alta, persistencia leída con el repositorio y con SQL, 400 con name vacío/ausente, timezone errata/inventada/vacía/ausente, JSON malformado) y `test/unit/error-handling.test.ts` (ValidationError/NotFoundError/ConflictError -> 400/404/409 con `{ error }`). Cada test usa datos propios; no dependen del orden ni truncan.
- `src/domain/errors.ts`: `DomainError` (abstracta) con `ValidationError`, `NotFoundError`, `ConflictError`. `TimeZone.parse` ahora lanza `ValidationError` (test de time-zone ajustado). Motivo: una sola jerarquía que el middleware traduce, para que T05, T07-T13 solo lancen errores de dominio.
- `src/domain/clinic.ts` (`Clinic { id, name, timeZone: TimeZone }`), puerto `src/application/ports/clinic-repository.ts` (`save`, `findById`), caso de uso `src/application/create-clinic.ts` (`makeCreateClinic({ clinics }) => CreateClinic`). El UUID se genera con `randomUUID` en el caso de uso: sin puerto IdGenerator porque nadie necesita fijarlo en tests (se comprueban forma y unicidad); si T07+ lo necesita, se extrae entonces.
- `src/infrastructure/db/kysely-clinic-repository.ts`: implementación Kysely.
- HTTP: `src/http/routes/clinics.ts` (Zod `{ name: min 1, timezone: string }`; la validez de la zona la decide `TimeZone`; mapper de presentación a `{ id, name, timezone }`). `createApp` recibe `deps.useCases?: Partial<UseCases>` y registra cada router solo si su caso de uso está; así AppDeps no crece por ruta. El middleware gana la rama `DomainError` (400/404/409).
- `src/main.ts` compone `createDb(pool)` -> repositorio -> caso de uso -> `createApp`.
- Verificación: `npm run lint`, `typecheck`, `npm test` (64 tests), `npm run build` en verde. Manual con `docker compose up --build -d api`: POST /clinics Europe/Madrid -> 201 con id UUID; Europe/Madird -> 400 `{"error":"Zona horaria no válida: ..."}`; `docker compose stop api` (db sigue arriba).
