# Plan de trabajo

Cada tarea es una historia de usuario con criterios de aceptación verificables. Se avanza tarea a tarea y en orden, salvo que la columna *Depende de* permita adelantar alguna.

## Cómo marcar el avance

1. Al empezar una tarea, cambia su `Estado:` a `en curso`.
2. Marca cada criterio de aceptación (`- [x]`) solo cuando haya un test o una comprobación que lo demuestre.
3. Con todos los criterios marcados y la definición de hecho cumplida, pon `Estado: hecha`, marca la tarea en el índice de abajo y añade el registro de la tarea.

## Índice

| ✔ | Tarea | Depende de |
|---|---|---|
| [x] | [T01 · Esqueleto del proyecto](T01-esqueleto-del-proyecto.md) | — |
| [x] | [T02 · Base de datos, migraciones y `/health`](T02-base-de-datos-y-health.md) | T01 |
| [x] | [T03 · Reloj del servicio](T03-reloj-del-servicio.md) | T01 |
| [x] | [T04 · Alta de clínicas](T04-alta-de-clinicas.md) | T02 |
| [x] | [T05 · Alta de pacientes](T05-alta-de-pacientes.md) | T04 |
| [x] | [T06 · Hora de envío del recordatorio](T06-hora-de-envio.md) | T01 |
| [x] | [T07 · Crear y consultar citas](T07-crear-y-consultar-citas.md) | T03, T05, T06 |
| [x] | [T08 · Reprogramar citas](T08-reprogramar-citas.md) | T07 |
| [x] | [T09 · Cancelar citas](T09-cancelar-citas.md) | T07 |
| [x] | [T10 · Pasada de envío](T10-pasada-de-envio.md) | T07 |
| [x] | [T11 · Reintentos y fallos del proveedor](T11-reintentos-y-fallos-del-proveedor.md) | T10 |
| [x] | [T12 · Pasadas concurrentes y envíos en vuelo](T12-pasadas-concurrentes.md) | T11, T08, T09 |
| [x] | [T13 · Respuestas del paciente](T13-respuestas-del-paciente.md) | T10 |
| [x] | [T14 · CI y calidad del código](T14-ci-y-calidad.md) | T01 |
| [x] | [T15 · Instrucciones para agentes](T15-instrucciones-para-agentes.md) | T14 |
| [x] | [T16 · README de entrega](T16-readme-de-entrega.md) | T13, T15 |
| [x] | [T17 · Entrega](T17-entrega.md) | T16 |
| [x] | [T18 · Crear la base de datos `clinicsay` si no existe](T18-crear-base-de-datos.md) | T02 |

## Flujo de trabajo con agentes

- **Orquestador (Opus):** elige la siguiente tarea, prepara el encargo del implementador con la historia, los criterios, los archivos implicados y las decisiones relevantes de `GLOSSARY.md` y `docs/adr/`. Después revisa el diff, ejecuta los tests, marca los criterios, hace el commit y actualiza este índice.
- **Implementador (Sonnet):** desarrolla una sola tarea siguiendo las reglas de abajo y devuelve su registro: qué hizo, por qué y cómo lo comprobó. No hace commits ni marca criterios.

## Reglas de implementación (ub-mode)

1. **Primero que funcione.** Se define la forma de los datos antes que la lógica. Cada test se escribe antes que el código y se le ve fallar por la razón esperada. El cambio es el más pequeño que lo haga pasar. Cada decisión vive en un solo sitio.
2. **Después que esté bien.** La lógica de negocio va en funciones puras del dominio y los datos se validan solo al entrar. No se silencia al compilador. Los tests verifican comportamiento observable, no la implementación. Se arregla la causa raíz, no el síntoma.
3. **Métricas de calidad** (se configuran en T14):
   - complejidad por función baja: CRAP < 10, con ESLint `complexity` y cobertura;
   - sin duplicación relevante, comprobada con `jscpd`;
   - mutantes supervivientes del dominio eliminados o justificados, con Stryker.
4. **Práctica.** Commits pequeños y ordenados en `develop`. Cada mensaje dice qué cambió y por qué, solo con el asunto y sin trailer de co-autoría. Cada tarea deja su registro de acciones al final de su archivo.

## Definición de hecho (todas las tareas)

- Todos los criterios de aceptación están marcados y cubiertos por tests.
- `npm run lint`, `npm run typecheck` y `npm test` pasan.
- Ningún código fuera de `infrastructure/clock/` llama a `new Date()` ni a `Date.now()`.
- Se ha hecho el commit en `develop` y se ha añadido el registro de la tarea.
