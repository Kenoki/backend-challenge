# Recordatorios de citas · ClinicSay

API (Node 22, TypeScript, Express 5, PostgreSQL) que recuerda cada cita por mensaje el día anterior, en la hora local de la clínica, y recoge la respuesta SI/NO del paciente. Está implementado todo el contrato de [`openapi.yaml`](openapi.yaml): clínicas, pacientes, citas (crear, consultar, reprogramar, cancelar), pasada de envío con reintentos, webhook de respuestas y reloj de pruebas.

## 1. Cómo levantarlo

Requisitos: Docker (y Node >= 22 solo para los tests).

```bash
docker compose up --build        # api :3000 (CLOCK_MODE=test), db :5432, provider :4010
curl localhost:3000/health       # {"status":"ok"}
```

Al arrancar, el servicio crea la base `clinicsay` si no existe (se conecta a la base `postgres` del mismo servidor) y luego aplica las migraciones; los tests de integración usan también `clinicsay` (la crean si falta) y hacen `TRUNCATE` de sus tablas, así que `npm test` borra los datos que hayas creado a mano. Recorrido de ejemplo (Git Bash o Linux; comprobado contra `docker compose up --build -d`). Cita el domingo 28/03/2027 a las 10:00 de Madrid, el día del cambio de hora:

```bash
id() { sed -E 's/^\{"id":"([^"]+)".*/\1/'; }
H='content-type: application/json'
PHONE=+346$((10000000 + RANDOM * 30))     # teléfono distinto en cada ejecución

# 1. Fijar la hora del servicio (solo existe con CLOCK_MODE=test)
curl -s -X PUT localhost:3000/test/clock -H "$H" -d '{"now":"2027-03-26T08:00:00Z"}' -w '%{http_code}\n'
# 2. Clínica, paciente y cita
CLINIC=$(curl -s -X POST localhost:3000/clinics -H "$H" -d '{"name":"Clinica Sol","timezone":"Europe/Madrid"}' | id)
PATIENT=$(curl -s -X POST localhost:3000/patients -H "$H" \
  -d "{\"clinicId\":\"$CLINIC\",\"name\":\"Ana\",\"phone\":\"$PHONE\",\"acceptsReminders\":true}" | id)
APPT=$(curl -s -X POST localhost:3000/appointments -H "$H" \
  -d "{\"clinicId\":\"$CLINIC\",\"patientId\":\"$PATIENT\",\"startsAt\":\"2027-03-28T10:00:00+02:00\"}" | id)
curl -s localhost:3000/appointments/$APPT
# 3. Mover el reloj a la hora de envío (sábado 27/03 a las 10:00 de Madrid = 09:00 UTC) y lanzar la pasada
curl -s -X PUT localhost:3000/test/clock -H "$H" -d '{"now":"2027-03-27T09:00:00Z"}' -w '%{http_code}\n'
curl -s -X POST localhost:3000/jobs/reminders/run
curl -s localhost:3000/appointments/$APPT
# 4. Lo que recibió el proveedor (el "+" va como %2B)
curl -s "localhost:4010/admin/messages?to=%2B${PHONE#+}"
# 5. El paciente responde
curl -s -X POST localhost:3000/webhooks/inbound-messages -H "$H" \
  -d "{\"messageId\":\"msg-1\",\"from\":\"$PHONE\",\"text\":\"SI\",\"receivedAt\":\"2027-03-27T09:05:00Z\"}"
curl -s localhost:3000/appointments/$APPT
```

Salida real (ids acortados): la cita nace con el recordatorio `pending` para `2027-03-27T09:00:00.000Z` (23 h antes de la cita, no 24); tras la pasada queda `sent` y el proveedor guarda un mensaje cuyo `idempotencyKey` es el id del recordatorio; tras el `SI` la cita pasa a `confirmed`.

```text
204
{"id":"51de…","startsAt":"2027-03-28T08:00:00.000Z","status":"scheduled","reminders":[{"id":"5063…","scheduledFor":"2027-03-27T09:00:00.000Z","status":"pending","attempts":0,"sentAt":null,"skipReason":null}]}
204
{"processed":1}
{"id":"51de…","status":"scheduled","reminders":[{"id":"5063…","status":"sent","attempts":1,"sentAt":"2027-03-27T09:00:00.000Z",…}]}
[{"to":"+34610042030","text":"Hola Ana, te recordamos tu cita en Clinica Sol el 28/03/2027 a las 10:00. Responde SI para confirmar o NO para cancelar.","idempotencyKey":"5063…","deliveredAt":"…"}]
{"status":"ok"}
{"id":"51de…","status":"confirmed","reminders":[{"id":"5063…","status":"sent",…}]}
```

`processed` cuenta todos los recordatorios vencidos de la base, no solo los de este recorrido. En Windows, `curl` desde Git Bash puede estropear los acentos escritos en la línea de comandos; por eso el ejemplo usa texto sin tildes (la API sí normaliza `Sí`).

## 2. Cómo pasar los tests

```bash
npm ci
docker compose up -d db provider     # los tests de integración usan Postgres y el proveedor reales
npm test                             # unitarios + integración
```

También: `npm run test:unit` (no necesita nada externo), `npm run lint`, `npm run typecheck`, `npm run test:coverage` (el dominio debe tener >= 90 % de líneas), `npm run dup` (duplicación) y `npm run mutation` (Stryker sobre `src/domain`; el último resultado fue 100 %). Los de integración hacen `TRUNCATE` de las tablas y `POST /admin/reset` al proveedor: no apuntes `DATABASE_URL` a una base que te importe. Variables de entorno, advertencias y detalle de cada comando: [`CLAUDE.md`](CLAUDE.md).

CI en [`.github/workflows/ci.yml`](.github/workflows/ci.yml): lint, tipos, unitarios con cobertura, integración (levanta `db` y `provider` con docker compose), build de la imagen, duplicación y mutación (esta última no bloqueante).

## 3. Decisiones

### Arquitectura

Clean Architecture en cuatro capas: `domain` (funciones puras y errores, sin I/O) <- `application` (casos de uso y puertos) <- `infrastructure` (Kysely, cliente del proveedor, relojes) y `http` (Express); `main.ts` compone todo. La regla de dependencias no es una convención: la impone ESLint con `no-restricted-imports`, igual que el límite de complejidad por función (10).

- Casos de uso como funciones `makeX(deps)` que reciben puertos (`UnitOfWork`, `ReminderQueue`, `MessageProvider`, `Clock`); los tests montan la app con lo mínimo.
- Express 5 con Zod en la frontera; el interior confía en tipos válidos. Los errores de negocio son `DomainError` (`ValidationError`, `NotFoundError`, `ConflictError`) y un único middleware los traduce a 400/404/409.
- Kysely con SQL explícito en lugar de un ORM ([ADR 0003](docs/adr/0003-kysely-en-lugar-de-orm.md)): `FOR UPDATE SKIP LOCKED`, updates condicionales e `INSERT ... ON CONFLICT` son el corazón del problema.
- Migraciones SQL propias (`src/infrastructure/db/migrations/`) con `pg_advisory_lock`, para que varias instancias arrancando a la vez no choquen.

### Envíos duplicados ([ADR 0001](docs/adr/0001-envio-unico-con-lease-e-idempotency-key.md))

- Cada pasada reclama con un único `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` que fija `claim_token` y un lease de 60 s. Dos pasadas nunca reclaman el mismo recordatorio.
- El proveedor se llama **fuera** de la transacción (no se retienen conexiones hasta 5 s por mensaje) y todo resultado se guarda con `WHERE claim_token = ...`: si el lease caducó y otra pasada tomó el recordatorio, la escritura tardía no hace nada.
- La `Idempotency-Key` es el id del recordatorio, igual en todos los intentos. `attempts` se incrementa **antes** de llamar; un 504 o un timeout se reintenta con la misma clave, así que el proveedor no entrega dos veces aunque el primer intento sí llegara.
- El lease usa el `now()` de Postgres, no el reloj de pruebas: mover `PUT /test/clock` no puede liberar ni bloquear claims.
- Hay tests con cinco pasadas HTTP en paralelo sobre 30 recordatorios (una petición y un mensaje por teléfono), pérdida de claim y envíos en vuelo.
- Webhook: el `messageId` se registra con `INSERT ... ON CONFLICT DO NOTHING` como primera operación de la misma transacción que aplica el efecto, así dos avisos repetidos o concurrentes producen un solo efecto.

### Zonas horarias y cambios de hora

- Luxon solo en el dominio. "El día anterior" es el día de calendario anterior en la zona de la clínica, no 24 h antes: la cita del 28/03/2027 a las 10:00 sale el 27/03 a las 10:00 (09:00 UTC, 23 h antes).
- Franja silenciosa [21:00, 09:00) local; lo que cae dentro pasa a las 09:00 siguientes. Las horas inexistentes o repetidas del cambio de hora caen en la madrugada, dentro de la franja, así que acaban a las 09:00 sin ningún caso especial (hay tests para marzo y octubre).
- Canarias (`Atlantic/Canary`) funciona igual porque la zona sale de la clínica. Las respuestas siempre llevan fechas en UTC con `Z`.

### El reloj

El puerto `Clock` se inyecta en los casos de uso. `TestClock` queda congelado en el instante que fija `PUT /test/clock`, y esa ruta solo se monta con `CLOCK_MODE=test`. ESLint prohíbe `new Date()` y `Date.now()` fuera de `src/infrastructure/clock/`, de modo que ninguna regla puede leer la hora real por descuido.

### Interpretación de las ambigüedades

- **Reprogramar** cancela solo los `pending` y conserva los `sent` (historial `[sent, pending]`); marcar `cancelled` un mensaje entregado falsearía el historial ([ADR 0002](docs/adr/0002-reprogramar-conserva-recordatorios-enviados.md)). Una cita confirmada vuelve a `scheduled`.
- **En vuelo:** reprogramar o cancelar no toca un recordatorio reclamado por una pasada. Si el envío tiene éxito queda `sent`; si falla y la cita está cancelada o el recordatorio ya no es el vigente, queda `cancelled` en vez de reintentarse.
- **Cuándo se decide `skipped`:** `too_late` al crear o reprogramar y de nuevo al enviar (también en reintentos); `no_phone` y `opted_out` solo al enviar, con precedencia `too_late` > `no_phone` > `opted_out`.
- **Errores del proveedor:** 200/202 entregado; 5xx, error de red y timeout de 5 s son reintentables; 4xx es terminal (`failed`). Reintentos a +1 y +5 min desde el fallo, sin respetar la franja; al tercer fallo, `failed`.
- **Ids que no son UUID** son "no encontrado" (404), nunca un 500 de Postgres.
- **Orden de errores al reprogramar:** esquema (400) -> cita inexistente (404) -> cancelada o ya empezada (409) -> `startsAt` no futuro (400).
- **Cancelar** una cita ya empezada se permite; cancelar dos veces devuelve la misma cita.
- **Respuestas:** `SI`/`NO` normalizados (mayúsculas, tildes, espacios y signos alrededor); otro texto se ignora. La cita destino es la del recordatorio `sent` más reciente al teléfono (`sent_at` y desempate por `sent_seq`) entre las no empezadas ni canceladas. El `messageId` se registra aunque el mensaje se ignore, y el webhook siempre responde 200 con un cuerpo válido.

### Descartado

- Fastify y NestJS: Express 5 basta y mantiene el código sin magia de framework.
- Un ORM (Prisma, TypeORM): ver ADR 0003.
- Colas externas (Redis, SQS) o un outbox: Postgres con `SKIP LOCKED` cubre el volumen y la garantía de envío único.
- Compartir el reloj de pruebas entre instancias: el enunciado lo usa con una sola API.

## 4. Qué quedó fuera y qué haría con más tiempo

- Outbox o colas para desacoplar la creación de citas del envío.
- Métricas y trazas (OpenTelemetry); hoy solo hay logs estructurados con pino.
- Rate limiting por clínica y por proveedor.
- Pruebas de carga con el volumen de la sección 5.
- Reloj de pruebas compartido entre instancias (hoy vive en memoria de cada proceso).
- Particionado o archivado de `reminders` por fecha cuando la tabla crezca.
- Normalizar `from` en el webhook (hoy se compara tal cual con el E.164 del paciente).
- Test de contrato automático contra `openapi.yaml`.
- `.gitattributes` para fijar finales de línea (en Windows git convierte CRLF).

## 5. Producción

**Volumen.** 500 clínicas y ~20 000 recordatorios al día son unos 14 por minuto de media. Como la franja silenciosa aplaza todo lo que caería de noche a las 09:00, habrá un pico alrededor de las 09:00 locales (miles de recordatorios en pocos minutos), que se absorbe porque la pasada trabaja por lotes con concurrencia acotada. Un único Postgres gestionado (RDS o similar, con réplica y copias) sobra. El índice parcial `reminders_pending_next_attempt_idx` mantiene barata la consulta de vencidos aunque la tabla crezca.

**Ejecución.** Un cron cada minuto que llame a `POST /jobs/reminders/run` en N instancias es seguro por `SKIP LOCKED` y el lease: dos instancias nunca envían el mismo recordatorio. Alternativa: un worker dedicado que ejecute `makeRunReminders` en bucle, separado de las instancias que atienden HTTP, y proteger el endpoint o sacarlo de la API pública.

**Proveedor real de WhatsApp (Business API).**
- Fuera de la ventana de 24 h solo se pueden enviar plantillas aprobadas: el texto fijo del recordatorio sería una plantilla con parámetros (nombre, clínica, fecha y hora).
- Opt-in explícito del paciente y gestión de la baja (`opted_out`).
- Verificar la firma de los webhooks y rechazar lo que no la tenga.
- Respetar límites de envío por número y por segundo; de ahí el rate limiting de la sección 4.
- Mapear sus errores a `delivered`, `retryable` o `rejected` dentro de `HttpMessageProvider`: es el único sitio que traduce códigos, el resto del sistema no cambia.
- Si el proveedor no ofrece idempotencia, guardar su id de mensaje antes de reintentar y consultar el estado en lugar de reenviar.

**Despliegue.** Imagen Docker (ya hay `Dockerfile` multi-stage) en ECS o Kubernetes con varias réplicas detrás de un balanceador. Las migraciones pasarían a ser un job previo al despliegue en lugar de ejecutarse al arrancar (el advisory lock ya evita carreras, pero un job falla antes de servir tráfico). `CLOCK_MODE=test` nunca se define en producción. `DATABASE_URL` y credenciales del proveedor en un gestor de secretos.

**Monitorización.**
- Métricas: enviados, fallidos y reintentos por minuto; edad del recordatorio vencido más antiguo (la señal principal de que las pasadas no corren); latencia y tasa de error del proveedor.
- Alertas: edad del vencido más antiguo por encima de unos minutos, `failed` en aumento, pasadas sin ejecutarse, errores 5xx de la API.
- Logs estructurados de pino con ids de cita y recordatorio, e instrumentación de `/health` (liveness) y una comprobación de base de datos como readiness.

## 6. Uso de la IA

- **Diseño.** Una sesión de preguntas (*grilling*) con Claude Opus cerró 22 decisiones antes de escribir código. Cambié Fastify por Express y acepté el resto. Después revisé y reescribí los ADR (renombré y amplié el 0001, añadí el 0002 y el 0003). En esa revisión la IA detectó dos huecos que se añadieron al ADR 0001: qué pasa si un envío en vuelo falla tras cancelar o reprogramar, y que el lease no puede usar el reloj de pruebas.
- **Plan.** 17 historias de usuario con criterios de aceptación en [`docs/tasks/`](docs/tasks/README.md). Un orquestador (Claude Opus) y un implementador (Claude Sonnet) por tarea, con TDD y reglas *ub-mode*; el orquestador revisa, ejecuta la verificación y hace el commit.
- **Correcciones sobre lo que propusieron los implementadores** (detalle en el registro de cada tarea):
  - T10: un reintento provisional dejaba el recordatorio vencido y la pasada lo habría reclamado sin fin; se programó con `next_attempt_at`.
  - T14: los mutantes supervivientes de `appointment.ts` se mataron añadiendo aserciones sobre los mensajes de error.
  - T12: se eliminó una aserción no determinista (que más de una pasada procesara algo) que habría hecho el test intermitente en CI.
  - T06: el criterio se alineó con el tipo real (unión discriminada con `skipReason` solo en `skipped`).
  - T04: se reutilizó el value object `TimeZone` en lugar de validar la zona por segunda vez.
  - Para trabajar en paralelo, los implementadores usaron una base de datos separada, para evitar `TRUNCATE` cruzados.
- Revisión del candidato: 
  - Stack: "Usar Express ya que en el enunciado no se menciona alguno en particular."
  - ADRs: "Agregué otros 2 ADRs que se obtuvieron en otra sesión con la skill grill-me. Añadí el 0002, que conserva los recordatorios enviados al reprogramar, y el 0003, que usa Kysely en lugar de un ORM."
  - Proceso: "Exigí un plan en historias de usuario con criterios de aceptación marcables antes de escribir código. También fijé el flujo de un orquestador (Opus) que revisa y un implementador (Sonnet) por tarea, siguiendo las reglas de ub-mode."
  - CI: "Cuestioné la propuesta de actualizar las actions a v5: la IA confundía el Node con el que se ejecutan las actions con el Node 22 del proyecto. Al revisarlo, la versión correcta era v7, y se validó en el CI."
  - Contrato: "Pedí verificar que la API cumpliera openapi.yaml. Se validaron 27 respuestas reales contra los esquemas, y la única diferencia era deliberada (400 en /test/clock)."
  - Control del repo: "Decidí cuándo hacer commit y cuándo push, y comprobé que el CI pasara en develop antes de mergear a main."

## 7. Mapa del repositorio

| Ruta | Qué es |
|---|---|
| [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) | Instrucciones para agentes y para quien trabaje en el repo: comandos, arquitectura, reglas, flujo |
| [`GLOSSARY.md`](GLOSSARY.md) | Lenguaje del dominio |
| [`docs/adr/`](docs/adr/) | Decisiones de diseño (0001 envío único, 0002 reprogramar, 0003 Kysely) |
| [`docs/tasks/`](docs/tasks/README.md) | Plan, criterios y registro de cada tarea |
| [`openapi.yaml`](openapi.yaml), [`enunciado.pdf`](enunciado.pdf) | Contrato y enunciado |
| `src/domain`, `src/application`, `src/infrastructure`, `src/http` | Las cuatro capas |
| `test/unit`, `test/integration` | Tests sin dependencias y contra Postgres y proveedor reales |
| `provider/` | Proveedor de mensajes simulado (no se modifica) |

Entrega: [formulario de entrega](https://docs.google.com/forms/d/e/1FAIpQLSd6OqQxPRvpBz_Cxw8KgOhN9-fsv5idE83PYGsH861BaMITCQ/viewform), hasta el miércoles 25 de noviembre de 2026 a las 17:30 de Madrid (11:30 en Lima).
