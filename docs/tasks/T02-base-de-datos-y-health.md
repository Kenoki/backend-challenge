# T02 · Base de datos, migraciones y `/health`

Estado: pendiente
Depende de: T01

## Historia

Como evaluador, quiero levantar todo con `docker compose up --build` y que `GET /health` responda 200 solo cuando la base está conectada y migrada, para poder lanzar los tests en cuanto el servicio esté listo.

## Criterios de aceptación

- [ ] El `Dockerfile` es multi-stage con Node 22 Alpine, compila con `tsc` y arranca `node dist/main.js`.
- [ ] `docker-compose.yml` añade `db` (`postgres:16-alpine` con healthcheck) y `api` (puerto 3000, `CLOCK_MODE=test`, `PROVIDER_URL=http://provider:4010`, `DATABASE_URL`, `depends_on` de `db` en estado sano). El servicio `provider` no se modifica.
- [ ] Las migraciones SQL de `src/infrastructure/db/migrations/` se ejecutan al arrancar, antes de aceptar peticiones, y son idempotentes: arrancar dos veces no falla.
- [ ] El esquema inicial crea `clinics`, `patients`, `appointments`, `reminders` e `inbound_messages` con las columnas de las notas.
- [ ] `GET /health` responde 200 si la base responde a `SELECT 1` y 503 si no.
- [ ] Un test de integración arranca el servicio contra Postgres y comprueba `/health` = 200.
- [ ] `docker compose up --build` deja `api`, `db` y `provider` en marcha y `curl localhost:3000/health` devuelve 200.

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

_(lo rellena el implementador al terminar)_
