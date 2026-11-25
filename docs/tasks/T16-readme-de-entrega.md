# T16 · README de entrega

Estado: hecha
Depende de: T13, T15

## Historia

Como evaluador, quiero un README que explique cómo levantar el servicio, las decisiones tomadas y cómo llevarlo a producción, para valorar el criterio sin tener que preguntar.

## Criterios de aceptación

- [x] **Cómo levantarlo y cómo pasar los tests**, con comandos copiables.
- [x] **Decisiones**:
  - arquitectura por capas;
  - cómo se evitan los envíos duplicados (ADR 0001);
  - zonas horarias y cambios de hora;
  - reloj de pruebas congelado;
  - interpretación de las ambigüedades (ADR 0002, reglas de Q8–Q14);
  - qué se descartó.
- [x] **Qué quedó fuera y qué haría con más tiempo**: outbox o colas, métricas y trazas, rate limiting por clínica, pruebas de carga, reloj compartido entre instancias.
- [x] **Producción**, en una página como máximo: 500 clínicas, unos 20 000 recordatorios al día, proveedor real de WhatsApp (plantillas, ventana de 24 h, webhooks firmados), despliegue y monitorización.
- [x] **Uso de la IA**: para qué se usó (diseño con preguntas, orquestador Opus con implementador Sonnet, ub-mode) y qué se corrigió de lo que propuso.
- [x] Enlaces a `GLOSSARY.md`, `docs/adr/` y `docs/tasks/`.

## Registro

- Reescrito `README.md` (7 secciones, ~190 líneas): qué es, cómo levantarlo con recorrido curl, cómo pasar los tests, decisiones (arquitectura, envíos duplicados, zonas horarias, reloj, ambigüedades, descartado), qué quedó fuera, producción (una página), uso de la IA y mapa del repo; se conserva el enlace al formulario y la fecha límite al final. Sin duplicar CLAUDE.md: se enlaza para el detalle de comandos y variables.
- Recorrido ejecutado de verdad con `docker compose up --build -d api`: PUT /test/clock, POST /clinics, /patients y /appointments, reloj a 2027-03-27T09:00Z, `POST /jobs/reminders/run` (recordatorio a sent, un mensaje con Idempotency-Key = id del recordatorio en /admin/messages) y webhook con SI (cita a confirmed). Después `docker compose stop api` (db y provider siguen arriba).
- Hallazgo: desde Git Bash en Windows, curl manda mal los acentos de la línea de comandos ("Sí" no confirmaba la cita; con \u00ed sí), no es un fallo de la API. El ejemplo usa "Clinica" y "SI" y el README lo avisa.
- La sección de IA recoge solo hechos de los registros y del encargo; queda un marcador TODO para que el candidato escriba qué corrigió él.
- Afirmaciones no contrastadas con el código: las del apartado de producción (son propuesta, no implementación).
