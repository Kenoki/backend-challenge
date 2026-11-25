# T18 · Crear la base de datos `clinicsay` si no existe

Estado: hecha
Depende de: T02

## Historia

Como operador, quiero que el servicio cree su base de datos `clinicsay` al arrancar si no existe, para poder apuntarlo a cualquier servidor Postgres sin prepararlo a mano.

## Criterios de aceptación

- [x] Antes de migrar, el servicio se conecta a la base de mantenimiento (`postgres`) del mismo servidor que `DATABASE_URL` y crea la base indicada en `DATABASE_URL` si no existe.
- [x] Si la base ya existe, no hace nada y no falla.
- [x] Si dos instancias intentan crearla a la vez, ninguna falla: se ignora el error de base duplicada (`42P04`, o `23505` si chocan en el catálogo).
- [x] El nombre de la base se escapa como identificador; nunca se interpola sin escapar.
- [x] `docker-compose.yml` y `.env.example` usan `.../clinicsay` en `DATABASE_URL`, y `docker compose up --build` arranca con `/health` = 200 sobre una base `clinicsay` recién creada.
- [x] Los tests de integración usan también `clinicsay` por defecto (cambio pedido tras la primera entrega de T18), con la URL en un único sitio y un setup global de Vitest que crea la base si falta.
- [x] README y CLAUDE.md mencionan el comportamiento.

## Notas para el implementador

- Una migración `.sql` no puede crear la base en la que corre: `CREATE DATABASE` no admite transacción y el migrador ya está conectado a la base destino. Por eso va en un paso previo, en `src/infrastructure/db/`.

## Registro

- **Tests primero.** `test/integration/ensure-database.test.ts` (Postgres real, bases con nombre aleatorio y `DROP DATABASE IF EXISTS` en `afterAll`): crea y luego devuelve `false`; dos llamadas concurrentes (exactamente una `true`); nombre con mayúsculas y guion (`T18-Raro_...`) creado tal cual; con la base `postgres` no hace nada. Se vio fallar por módulo inexistente.
- **Implementación.** `src/infrastructure/db/ensure-database.ts`: `ensureDatabase(databaseUrl): Promise<boolean>`. Parsea la URL, conecta con `pg.Client` a la misma URL con base `postgres`, consulta `pg_database` y, si falta, `CREATE DATABASE` con `client.escapeIdentifier`. Cierra el cliente siempre.
- **Hallazgo en la carrera.** Dos `CREATE DATABASE` simultáneos no siempre fallan con `42P04`: Postgres puede devolver `23505` (`pg_database_datname_index`). El test concurrente lo destapó, así que se ignoran ambos códigos (`RACE_CODES`).
- **Cableado.** `main.ts` la llama antes de crear el `Pool` y migrar, y loguea "Base de datos creada" solo si la creó. `docker-compose.yml` (servicio `api`) y `.env.example` pasan a `.../clinicsay`; `provider` y la base de los tests no se tocan. README y CLAUDE.md lo mencionan y aclaran que los tests usan su propia base (`postgres`).
- **Comprobación.** `npm run lint`, `typecheck`, `npm test` (328 tests), `build` y `dup` (0 clones) pasan. De punta a punta: `DROP DATABASE clinicsay`, `docker compose up --build -d api` -> `/health` 200, logs "Base de datos creada" y "Migraciones aplicadas", `clinicsay` aparece en `psql -l`; tras `docker compose restart api` vuelve a 200 sin el log de creación. Api parado al final; db y provider arriba.
- Orquestador (cambio posterior): los tests pasan a usar `clinicsay` por defecto. La URL por defecto, antes repetida en 9 archivos, vive ahora solo en `test/support/database-url.ts`; `test/support/global-setup.ts` (globalSetup de Vitest) llama a `ensureDatabase` antes de los tests; el CI usa `.../clinicsay`. README y CLAUDE.md avisan de que `npm test` vacía las tablas de `clinicsay`.
