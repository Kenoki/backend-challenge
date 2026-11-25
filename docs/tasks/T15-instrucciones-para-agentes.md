# T15 · Instrucciones para agentes

Estado: hecha
Depende de: T14

## Historia

Como persona o agente de IA que llega nuevo al repositorio, quiero instrucciones claras de cómo trabajar en él, para hacer cambios sin preguntar a nadie.

## Criterios de aceptación

- [x] `CLAUDE.md` en la raíz describe:
  - las capas y sus reglas de dependencia;
  - los comandos (`lint`, `typecheck`, `test`, `dup`, `mutation`);
  - cómo levantar el entorno;
  - la prohibición de usar `new Date()` fuera de `infrastructure/clock/`;
  - dónde viven el glosario, los ADRs y las tareas;
  - las reglas ub-mode del flujo orquestador/implementador;
  - el estilo de los commits.
- [x] `AGENTS.md` apunta a `CLAUDE.md`, para agentes que no son Claude.
- [x] Un agente nuevo puede ejecutar los tests siguiendo solo esas instrucciones. Se comprueba lanzando un subagente sin contexto previo.

## Registro

- `CLAUDE.md` (raíz): descripción y enlaces (enunciado, openapi, glosario, ADRs, tareas); tabla de comandos y variables de entorno con la advertencia de que la integración comparte Postgres y proveedor y hace `TRUNCATE`/`/admin/reset`; capas y regla de dependencias con archivos reales; patrones obligatorios (DomainError, puertos, `makeX(deps)`, isUuid, UnitOfWork + `findByIdForUpdate`, `createApp`, reloj); tabla de reglas de negocio archivo a regla; ub-mode, flujo de tareas, flujo orquestador/implementador, estilo de commits, cuándo escribir ADR y actualizar el glosario; trampas conocidas. Todo contrastado con `package.json`, ESLint, Vitest, Docker, CI y `src/`.
- `AGENTS.md` (raíz): breve, apunta a `CLAUDE.md` como única fuente y repite solo tres imprescindibles.
- **Verificación:** subagente sin contexto, que leyó solo `CLAUDE.md` y ejecutó `npm run lint`, `npm run typecheck` y `npm run test:unit`: los tres pasaron (147 tests unitarios). Reportó cuatro huecos: cuándo basta `test:unit` frente a `npm test`, qué shell usar, cuándo hacer `npm ci` y el aviso de Vitest sobre `isolate`. Se corrigieron en `CLAUDE.md`.
- No se ejecutaron tests de integración (el trabajo paralelo de T12 usa la base compartida).
