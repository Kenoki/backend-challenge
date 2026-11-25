# T15 · Instrucciones para agentes

Estado: pendiente
Depende de: T14

## Historia

Como persona o agente de IA que llega nuevo al repositorio, quiero instrucciones claras de cómo trabajar en él, para hacer cambios sin preguntar a nadie.

## Criterios de aceptación

- [ ] `CLAUDE.md` en la raíz describe:
  - las capas y sus reglas de dependencia;
  - los comandos (`lint`, `typecheck`, `test`, `dup`, `mutation`);
  - cómo levantar el entorno;
  - la prohibición de usar `new Date()` fuera de `infrastructure/clock/`;
  - dónde viven el glosario, los ADRs y las tareas;
  - las reglas ub-mode del flujo orquestador/implementador;
  - el estilo de los commits.
- [ ] `AGENTS.md` apunta a `CLAUDE.md`, para agentes que no son Claude.
- [ ] Un agente nuevo puede ejecutar los tests siguiendo solo esas instrucciones. Se comprueba lanzando un subagente sin contexto previo.

## Registro

_(lo rellena el implementador al terminar)_
