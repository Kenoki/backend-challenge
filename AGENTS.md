# AGENTS.md

Las instrucciones para trabajar en este repositorio (comandos, arquitectura, reglas de negocio, flujo de tareas y estilo de commits) están en [`CLAUDE.md`](CLAUDE.md), que es la única fuente. Léelo entero antes de cambiar nada.

Lo imprescindible, por si no puedes abrirlo:

- `npm ci`, y luego `npm run lint`, `npm run typecheck` y `npm run test:unit` (los tests de integración necesitan `docker compose up -d db provider`).
- Nunca `new Date()` ni `Date.now()` fuera de `src/infrastructure/clock/`.
- Commits en `develop`, en español, solo asunto, sin trailer de co-autoría.
