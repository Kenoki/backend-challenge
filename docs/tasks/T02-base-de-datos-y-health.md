# T02 · Base de datos, migraciones y `/health`

Estado: hecha
Depende de: T01

## Historia

Como evaluador, quiero levantar todo con `docker compose up --build` y que `GET /health` responda 200 solo cuando la base está conectada y migrada, para poder lanzar los tests en cuanto el servicio esté listo.

## Criterios de aceptación

- [x] El `Dockerfile` es multi-stage con Node 22 Alpine, compila con `tsc` y arranca `node dist/main.js`.
- [x] `docker-compose.yml` añade `db` (`postgres:16-alpine` con healthcheck) y `api` (puerto 3000, `CLOCK_MODE=test`, `PROVIDER_URL=http://provider:4010`, `DATABASE_URL`, `depends_on` de `db` en estado sano). El servicio `provider` no se modifica.
- [x] Las migraciones SQL de `src/infrastructure/db/migrations/` se ejecutan al arrancar, antes de aceptar peticiones, y son idempotentes: arrancar dos veces no falla.
- [x] El esquema inicial crea `clinics`, `patients`, `appointments`, `reminders` e `inbound_messages` con las columnas de las notas.
- [x] `GET /health` responde 200 si la base responde a `SELECT 1` y 503 si no.
- [x] Un test de integración arranca el servicio contra Postgres y comprueba `/health` = 200.
- [x] `docker compose up --build` deja `api`, `db` y `provider` en marcha y `curl localhost:3000/health` devuelve 200.

## Notas para el implementador

Primero se fija la forma de los datos, que condiciona todas las tareas posteriores:

- `clinics(id uuid pk, name text, timezone text)`
- `patients(id uuid pk, clinic_id fk, name text, phone text null, accepts_reminders bool)`, con índice por `phone`
- `appointments(id uuid pk, clinic_id fk, patient_id fk, starts_at timestamptz, status text check in (scheduled, confirmed, cancelled))`
- `reminders`:
  - `id uuid pk`, `seq bigserial` (orden del historial), `appointment_id fk`;
  - `for_starts_at timestamptz` (inicio de cita al que pertenece; sirve para saber si es el vigente);
  - `scheduled_for timestamptz`, `next_attempt_at timestamptz`;
  - `status text check in (pending, sent, failed, skipped, cancelled)`, `skip_reason text null`;
  - `attempts int default 0`, `sent_at timestamptz null`, `sent_seq bigint null` (desempate de la "cita destino");
  - `claim_token uuid null`, `claimed_until timestamptz null`;
  - índice parcial en `(next_attempt_at) where status = 'pending'`.
- `inbound_messages(message_id text pk, received_at timestamptz, outcome text)`

Ejecuta las migraciones con el `Migrator` de Kysely y un `FileMigrationProvider`, o con un runner mínimo propio que guarde las aplicadas en una tabla. Ver ADR 0003.

## Registro

- **Tests primero.** `test/integration/health.test.ts`: migrar dos veces y dos en paralelo, existencia de las 5 tablas, `/health` 200 y 503 (comprobación inyectada que falla). Se vio fallar (módulo `migrator` inexistente) antes de implementar. Necesita Postgres: `docker compose up -d db` (usa `DATABASE_URL` o `postgres://postgres:postgres@localhost:5432/postgres`).
- **Migraciones.** `src/infrastructure/db/migrations/0001_init.sql` con el esquema de las notas, más la secuencia `reminder_sent_seq` e índices en `patients.phone`, `patients.clinic_id`, `appointments.patient_id/clinic_id` y `reminders.appointment_id`, y el índice parcial de `reminders`. Runner mínimo propio (`infrastructure/db/migrator.ts`): tabla `schema_migrations`, `pg_advisory_lock` para que dos instancias no choquen y cada archivo en su transacción; idempotente. Elegí runner propio porque el Migrator de Kysely exige un provider de módulos JS, y así los `.sql` son planos.
- **Dónde viven y cómo llegan a la imagen.** Se quedan en `src/infrastructure/db/migrations/` y el runner los resuelve relativos a su propio archivo (`import.meta.url`), así funcionan igual con tsx, vitest y `dist/`. `npm run build` copia la carpeta a `dist/infrastructure/db/migrations` tras `tsc` (un solo sitio, sirve también en local); el Dockerfile solo ejecuta el build.
- **Tipos Kysely** en `infrastructure/db/database.ts` (`Database` y `createDb(pool)`). Los `bigint` (`seq`, `sent_seq`) son `string`, como los devuelve `pg`.
- **`/health`.** `createApp` acepta `checkDatabase?: () => Promise<void>`; si se inyecta, `GET /health` da 200 `{status:"ok"}` o 503 `{error:"Database unavailable"}` (y loguea). `http` no importa infraestructura; `main.ts` compone con `pool.query('SELECT 1')`.
- **`main.ts`.** `DATABASE_URL` obligatoria, migra antes de escuchar y cierra ordenadamente en SIGTERM/SIGINT (server y pool).
- **Docker.** `Dockerfile` multi-stage `node:22-alpine` (`npm ci` + build; final con `npm ci --omit=dev` + `dist`, `CMD node dist/main.js`), `.dockerignore`. `docker-compose.yml`: `db` (postgres:16-alpine, healthcheck `pg_isready`, puerto 5432 expuesto, sin volumen) y `api` (3000, `CLOCK_MODE=test`, `PROVIDER_URL`, `DATABASE_URL`, `depends_on` db sano y provider iniciado); `provider` intacto.
- **Comprobación.** `npm run lint`, `npm run typecheck`, `npm test` (38 tests) y `npm run build` pasan con `db` levantada. `docker compose up --build -d`: `api`, `db` y `provider` en marcha, `curl localhost:3000/health` = 200 y los logs muestran migraciones aplicadas antes de escuchar; luego `docker compose down`.
