# CLAUDE.md

Servicio backend de ClinicSay (Node 22, TypeScript, Express 5, Postgres con Kysely): recuerda las citas por mensaje el día anterior y recoge la respuesta SI/NO del paciente. El proveedor de mensajes es un servidor fake en `provider/`.

- Enunciado: [`enunciado.pdf`](enunciado.pdf) · contrato HTTP: [`openapi.yaml`](openapi.yaml)
- Lenguaje del dominio (úsalo en código, tests y mensajes): [`GLOSSARY.md`](GLOSSARY.md)
- Decisiones de diseño: [`docs/adr/`](docs/adr/) (envío único con lease e Idempotency-Key, reprogramar conserva los `sent`, Kysely)
- Plan, criterios y registros de cada tarea: [`docs/tasks/`](docs/tasks/README.md)

## Puesta en marcha

Requisitos: Node >= 22 y Docker. Si no existe `node_modules/`, ejecuta `npm ci` primero. Los scripts npm funcionan igual en PowerShell, Git Bash o Linux; el árbol de trabajo puede traer cambios sin confirmar de otras tareas: no los reviertas.

| Qué | Comando |
|---|---|
| Levantar todo (api en :3000, db en :5432, provider en :4010) | `docker compose up --build` |
| Solo dependencias para tests de integración | `docker compose up -d db provider` |
| Arrancar la API en local con recarga | `npm run dev` (necesita `DATABASE_URL`) |
| Lint (incluye reglas de capas y del reloj) | `npm run lint` |
| Tipos | `npm run typecheck` |
| Todos los tests / unitarios / integración | `npm test` / `npm run test:unit` / `npm run test:integration` |
| Cobertura (falla si `src/domain` < 90 % de líneas) | `npm run test:coverage` |
| Duplicación (`jscpd`, umbral 3 %) | `npm run dup` |
| Mutación sobre `src/domain` (Stryker; lento) | `npm run mutation` |
| Compilar | `npm run build` (luego `npm start`) |

Los tests unitarios (`test/unit`) no necesitan nada externo. Los de integración (`test/integration`) necesitan Postgres y el proveedor levantados (`docker compose up -d db provider`).

Variables de entorno (`.env.example`; no se carga ningún `.env` solo, expórtalas tú):

- `DATABASE_URL`: obligatoria para arrancar la API; si la base indicada no existe, el servicio la crea al arrancar (`infrastructure/db/ensure-database.ts`; `docker compose` usa `clinicsay`). Los tests de integración usan `postgres://postgres:postgres@localhost:5432/clinicsay` si no se define (un único sitio: `test/support/database-url.ts`), y `test/support/global-setup.ts` crea esa base antes de ejecutarlos si no existe. Como hacen `TRUNCATE`, `npm test` borra los datos que hayas creado a mano en `clinicsay`.
- `PROVIDER_URL`: por defecto `http://localhost:4010`.
- `CLOCK_MODE=test`: habilita el reloj controlable `PUT /test/clock` (y es lo que usa `docker compose`). Sin ella, reloj del sistema.
- `PORT` (3000) y `LOG_LEVEL` (`info`).

**Cuidado:** los tests de integración comparten Postgres y el proveedor, y algunos hacen `TRUNCATE` de las tablas y `POST /admin/reset` del proveedor. No apuntes `DATABASE_URL` a una base con datos que te importen; para aislarte crea otra base y úsala (`CREATE DATABASE mi_base;`).

## Arquitectura

Capas y regla de dependencias (la impone ESLint con `no-restricted-imports`):

```
domain  <-  application  <-  infrastructure
                         <-  http
main.ts compone todo (única pieza que conoce las implementaciones)
```

| Capa | Qué va | Ejemplos |
|---|---|---|
| `src/domain/` | Tipos y funciones puras, sin I/O ni imports de otras capas. Lanza `DomainError`. | `delivery-decision.ts`, `reminder-schedule.ts`, `retry-policy.ts`, `patient-reply.ts`, `appointment.ts`, `errors.ts`, `uuid.ts` |
| `src/application/` | Casos de uso `makeX(deps)` que orquestan dominio y puertos. Solo importa `domain`. | `create-appointment.ts`, `reschedule-appointment.ts`, `run-reminders.ts`, `handle-inbound-message.ts` |
| `src/application/ports/` | Interfaces que la aplicación necesita. | `appointment-repository.ts`, `unit-of-work.ts`, `reminder-queue.ts`, `message-provider.ts`, `clock.ts` |
| `src/infrastructure/` | Implementaciones de puertos: Kysely/`pg`, cliente HTTP del proveedor, relojes. | `db/kysely-*.ts`, `db/migrator.ts`, `db/migrations/*.sql`, `provider/http-message-provider.ts`, `clock/` |
| `src/http/` | Express: `createApp(deps)`, rutas finas, esquemas zod, middleware de errores. | `app.ts`, `routes/*.ts`, `schemas.ts` |

Patrones obligatorios:

- **Errores:** el dominio y la aplicación lanzan `DomainError` (`NotFoundError`, `ConflictError`, ...); un único middleware en `http/app.ts` los traduce a HTTP. Las rutas no hacen `res.status(4xx)` a mano por errores de negocio.
- **Validar en la frontera:** zod en `http/schemas.ts`; el interior confía en tipos ya válidos. Los ids que llegan a SQL se comprueban con `isUuid` (`domain/uuid.ts`) en los repositorios Kysely, y un id mal formado es "no encontrado", no un 500.
- **Casos de uso:** `makeX({ ...puertos, clock })` devuelve una función; se cablean en `main.ts` y se pasan a `createApp({ useCases })`. Cada ruta se registra solo si su caso de uso está presente, así los tests montan la app con lo mínimo.
- **Transacciones:** `UnitOfWork.run(repos => ...)`; para modificar una cita se bloquea con `appointments.findByIdForUpdate(id)` y se vuelve a comprobar el estado antes de escribir.
- **El reloj:** nunca `new Date()` ni `Date.now()` fuera de `src/infrastructure/clock/` (ESLint lo rechaza; `new Date(valor)` con argumento sí está permitido). La hora se inyecta como `Clock` (`application/ports/clock.ts`) y los tests usan `TestClock`.
- **SQL:** Kysely solo en `infrastructure/db`. Los tipos de tabla están en `db/database.ts`; los `bigint` llegan como `string`.

## Reglas de negocio clave

| Dónde | Regla |
|---|---|
| `domain/reminder-schedule.ts` | Hora de envío: misma hora local del día anterior, nunca antes de `now`; si cae en la franja silenciosa [21:00, 09:00) local de la clínica se lleva a las 09:00 siguientes. |
| `domain/delivery-decision.ts` | Descartes y precedencia: `too_late` (inicio <= ahora), `no_phone`, `opted_out`. |
| `domain/appointment.ts` | Crear (cita `scheduled` + primer recordatorio), reprogramar (cancela solo los `pending`, conserva los `sent`, crea uno nuevo; ADR 0002) y cancelar. |
| `domain/retry-policy.ts` | Reintentos a +1 y +5 min desde la hora del fallo (no respetan la franja silenciosa); máximo 3 intentos, luego `failed`. |
| `application/run-reminders.ts` + `infrastructure/db/kysely-reminder-queue.ts` | Pasada: reclama con `FOR UPDATE SKIP LOCKED` + lease, llama al proveedor fuera de la transacción con `Idempotency-Key` = id del recordatorio, y guarda solo si sigue siendo dueña del claim (ADR 0001). |
| ADR 0001 | En vuelo: reprogramar/cancelar no toca un recordatorio reclamado; si su envío falla y la cita está cancelada o el recordatorio ya no es el vigente, pasa a `cancelled` en vez de reintentarse. |
| `domain/patient-reply.ts` + `application/handle-inbound-message.ts` | Respuestas: solo `SI` (confirma) y `NO` (cancela), sin tildes ni mayúsculas; idempotente por `messageId`; la cita destino es la del recordatorio enviado más recientemente a ese teléfono entre las no empezadas ni canceladas. |

## Cómo trabajar

Skills del proyecto en [`.claude/skills/`](.claude/skills/):
- `/grill-with-docs`: entrevista por rondas para cerrar un diseño. Invoca `grilling` y `domain-modeling`, que mantiene `GLOSSARY.md` y los ADR de `docs/adr/`. Úsala antes de una decisión de diseño nueva.
- `/ub-mode`: reglas de implementación (MIT, Robert C. Martin). Úsala al escribir o cambiar código.

Reglas ub-mode (detalle en [`docs/tasks/README.md`](docs/tasks/README.md)):

1. **Primero que funcione:** define la forma de los datos, escribe el test antes que el código y míralo fallar por la razón esperada; haz el cambio mínimo que lo pase; cada decisión vive en un solo sitio.
2. **Después que esté bien:** lógica de negocio en funciones puras del dominio, datos validados solo al entrar, nunca silenciar al compilador (`any`, `@ts-ignore`), tests de comportamiento observable y arreglar la causa raíz.
3. **Métricas:** complejidad por función con CRAP < 10 (ESLint `complexity` 10 + cobertura), sin duplicación relevante (`npm run dup`), mutantes supervivientes del dominio eliminados o justificados (`npm run mutation`).

Antes de dar algo por hecho deben pasar `npm run lint`, `npm run typecheck` y `npm test`. `npm test` incluye integración (necesita `docker compose up -d db provider`); si tu cambio solo toca `src/domain` o `test/unit`, `npm run test:unit` basta para iterar, pero antes de cerrar la tarea ejecuta `npm test`. Los avisos informativos de Vitest (p. ej. sobre `isolate`) no son acciones pendientes.

Flujo de tareas: cada tarea de `docs/tasks/` tiene `Estado:`, criterios de aceptación y `## Registro`. Un criterio solo se marca con un test o comprobación que lo demuestre. Al terminar: todos los criterios marcados, `Estado: hecha`, tarea marcada en el índice del README y registro escrito (qué se hizo, por qué, cómo se comprobó).

Flujo con agentes: el **orquestador (Opus)** elige la tarea, prepara el encargo, revisa el diff, ejecuta los tests, marca criterios, hace el commit y actualiza el índice. El **implementador (Sonnet)** hace una sola tarea siguiendo ub-mode y devuelve su registro; no hace commits ni marca criterios.

Commits: en `develop`, un commit por tarea, en español, **solo asunto** (qué cambió y por qué, p. ej. `T13: respuestas SI/NO del paciente con messageId idempotente`), **sin trailer `Co-Authored-By`** ni ninguna otra línea de atribución.

Cuándo documentar:

- **ADR** (`docs/adr/NNNN-titulo.md`, corto: decisión, alternativas descartadas, consecuencias) cuando la decisión es difícil de revertir, sorprendería a quien llegue después o fue una elección real entre alternativas.
- **GLOSSARY.md** cuando aparece, cambia o se descarta un término del dominio; úsalo tal cual en nombres de código y mensajes.

## Trampas conocidas

- **Integración en serie:** `vitest.config.ts` fija `fileParallelism: false` porque los archivos comparten Postgres y el proveedor, y la pasada de envío trata todos los recordatorios vencidos de la base. No lo cambies ni lances dos suites de integración a la vez (ni dos agentes sobre la misma base).
- **Lease con el reloj de Postgres:** `claimed_until` usa `now()` de Postgres, no el `Clock`. Mover `PUT /test/clock` no caduca ni bloquea leases; en tests, para forzar un lease caducado hay que escribir en la base.
- **Migraciones en el build:** los `.sql` de `src/infrastructure/db/migrations/` no los copia `tsc`; `npm run build` los copia a `dist/` y el `Dockerfile` ya ejecuta ese script. Si añades otro tipo de asset, cópialo igual.
- **Imports ESM:** los imports relativos terminan en `.js` (NodeNext), aunque el archivo sea `.ts`.
- **Windows/CRLF:** git convierte finales de línea (`core.autocrlf`); no reformatees archivos enteros por eso. Usa Git Bash para scripts POSIX.
- **`/health` y migraciones:** la API crea la base si falta y migra al arrancar; los tests de integración llaman a `migrate` ellos mismos.
