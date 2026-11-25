# T16 · README de entrega

Estado: pendiente
Depende de: T13, T15

## Historia

Como evaluador, quiero un README que explique cómo levantar el servicio, las decisiones tomadas y cómo llevarlo a producción, para valorar el criterio sin tener que preguntar.

## Criterios de aceptación

- [ ] **Cómo levantarlo y cómo pasar los tests**, con comandos copiables.
- [ ] **Decisiones**:
  - arquitectura por capas;
  - cómo se evitan los envíos duplicados (ADR 0001);
  - zonas horarias y cambios de hora;
  - reloj de pruebas congelado;
  - interpretación de las ambigüedades (ADR 0002, reglas de Q8–Q14);
  - qué se descartó.
- [ ] **Qué quedó fuera y qué haría con más tiempo**: outbox o colas, métricas y trazas, rate limiting por clínica, pruebas de carga, reloj compartido entre instancias.
- [ ] **Producción**, en una página como máximo: 500 clínicas, unos 20 000 recordatorios al día, proveedor real de WhatsApp (plantillas, ventana de 24 h, webhooks firmados), despliegue y monitorización.
- [ ] **Uso de la IA**: para qué se usó (diseño con preguntas, orquestador Opus con implementador Sonnet, ub-mode) y qué se corrigió de lo que propuso.
- [ ] Enlaces a `GLOSSARY.md`, `docs/adr/` y `docs/tasks/`.

## Registro

_(lo rellena el implementador al terminar)_
