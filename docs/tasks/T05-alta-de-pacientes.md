# T05 · Alta de pacientes

Estado: hecha
Depende de: T04

## Historia

Como integrador de ClinicSay, quiero dar de alta pacientes de una clínica con su teléfono y su preferencia de recordatorios, para poder recordarles sus citas.

## Criterios de aceptación

- [x] `POST /patients { clinicId, name, phone, acceptsReminders }` responde 201 con `{ id, clinicId, name, phone, acceptsReminders }`.
- [x] `phone` admite un E.164 (`^\+[1-9]\d{7,14}$`) o `null`; si se omite, se guarda como `null`.
- [x] Un teléfono que no es E.164 (`600111222`, `+0034...`) responde 400.
- [x] Un `name` vacío o un `acceptsReminders` que no es booleano responden 400.
- [x] Un `clinicId` que no existe, o que no es un UUID, responde 404.
- [x] Los errores de validación (400) se comprueban antes que la existencia de la clínica (404).

## Notas para el implementador

- Value object `PhoneNumber` (E.164) en el dominio. La regex vive en un único sitio.

## Registro

- Tests primero (vistos fallar por módulo inexistente): `test/unit/phone-number.test.ts`, `test/unit/uuid.test.ts` y `test/integration/patients.test.ts` (HTTP + Postgres real: 201 con phone, phone null y phone omitido -> null; acceptsReminders false; persistencia con el repositorio y SQL; 400 con teléfono `600111222`/`+0034600111222`/`+34`/con letras, name vacío o ausente, acceptsReminders string o ausente, phone numérico, clinicId ausente; 404 con clinicId inexistente y no-UUID; 400 antes que 404 tanto por esquema como por teléfono).
- `src/domain/phone-number.ts`: `PhoneNumber.parse(value)` (E.164 `^\+[1-9]\d{7,14}$`, regex solo ahí; lanza `ValidationError`; expone `.value`). `src/domain/patient.ts`: `Patient { id, clinicId, name, phone: PhoneNumber | null, acceptsReminders }`.
- Puerto `src/application/ports/patient-repository.ts` (`save`, `findById`) e implementación `src/infrastructure/db/kysely-patient-repository.ts`. Caso de uso `src/application/create-patient.ts` (`makeCreatePatient({ clinics, patients })`): parsea el teléfono (400) antes de consultar la clínica (404 `NotFoundError`); id UUID con `randomUUID`.
- Ids no-UUID: la decisión vive en `src/domain/uuid.ts` (`isUuid`) y la aplican los repositorios en `findById` (devuelven `null`), así que Postgres nunca recibe un `uuid` mal formado. Se aplicó a `KyselyClinicRepository` y `KyselyPatientRepository`; T07 reutiliza lo mismo para clínica, paciente y cita.
- HTTP: `src/http/routes/patients.ts` (Zod `{ clinicId: string, name: min 1, phone: string | null con default null, acceptsReminders: boolean estricto }`; mapper a `{ id, clinicId, name, phone, acceptsReminders }`). Registrado en `UseCases`/`createApp` y en `src/main.ts`. Sin cambios de esquema SQL.
- Verificación: `npm run lint`, `typecheck`, `npm test` (103 tests), `npm run build` en verde. Manual con `docker compose up --build -d api`: POST /clinics -> POST /patients con `+34600111222` -> 201; clinicId `abc` -> 404; `docker compose stop api` (db sigue arriba).
