# T01 · Esqueleto del proyecto

Estado: hecha
Depende de: —

## Historia

Como desarrollador del equipo, quiero un proyecto TypeScript con la estructura de capas, el lint, los tipos y los tests ya configurados, para poder añadir funcionalidad sin decidir de nuevo la base.

## Criterios de aceptación

- [x] `package.json` exige Node ≥ 22 y define los scripts `build`, `start`, `dev`, `lint`, `typecheck`, `test`, `test:unit` y `test:integration`.
- [x] `tsconfig.json` usa modo `strict` con `noUncheckedIndexedAccess` y compila `src/` a `dist/`.
- [x] Existen las carpetas `src/domain`, `src/application`, `src/infrastructure`, `src/http` y `test/unit`, `test/integration`, más `src/main.ts` como composition root.
- [x] ESLint (flat config con typescript-eslint) impide que `domain` importe de `application`, `infrastructure` o `http`, y que `application` importe de `infrastructure` o `http`.
- [x] ESLint prohíbe `new Date()` y `Date.now()` fuera de `src/infrastructure/clock/`.
- [x] ESLint aplica `complexity` con un máximo de 10.
- [x] Vitest ejecuta un test unitario de ejemplo y `npm run lint`, `npm run typecheck` y `npm test` pasan.
- [x] La app Express 5 arranca en `PORT` (por defecto 3000) y responde 404 con `{ "error": "Not found" }` a cualquier ruta desconocida.

## Notas para el implementador

- Dependencias: `express@5`, `zod`, `pino`, `pino-http`, `luxon`, `kysely` y `pg`. Para desarrollo: `typescript`, `tsx`, `vitest`, `@vitest/coverage-v8`, `eslint`, `typescript-eslint`, `eslint-plugin-boundaries` o `no-restricted-imports`, y los `@types` necesarios.
- No añadas lógica de negocio todavía.

## Registro

- `package.json` (ESM, `engines.node >=22`, scripts `build/start/dev/lint/typecheck/test/test:unit/test:integration`) e instalación de dependencias (express 5.3, zod 4.6, pino 10, pino-http 11, luxon, kysely, pg) y de desarrollo (typescript 6, tsx, vitest 5, @vitest/coverage-v8, eslint 10, typescript-eslint 8, supertest, @types/*). Se fijó `@types/node@22` para coincidir con el motor mínimo. Comprobado con `npm ls`.
- `tsconfig.json` (NodeNext, ES2023, `strict`, `noUncheckedIndexedAccess`, `noEmit`, incluye `src` y `test`) y `tsconfig.build.json` (emite `src/` a `dist/`). Comprobado con `npm run typecheck` y `npm run build` (genera `dist/main.js`).
- Carpetas `src/domain`, `src/application`, `src/infrastructure/clock` (con `.gitkeep`), `src/http`, `test/unit`, `test/integration`.
- TDD: se escribieron antes `test/unit/example.test.ts` y `test/integration/app.test.ts` (404, JSON malformado, ZodError, 500) y se vio fallar el de integración por la falta de `src/http/app.ts`. Después se implementó `createApp(deps)` (`express.json()`, rutas inyectables, 404 final, middleware de errores: 400 JSON inválido, 400 Zod legible, 500 genérico con log pino) y `src/main.ts` (PORT por defecto 3000, pino y pino-http). `npm test` pasa (5 tests).
- `vitest.config.ts` para limitar la búsqueda de tests a `test/**`.
- `eslint.config.js` (flat, typescript-eslint `recommendedTypeChecked`): `complexity` 10; `no-restricted-syntax` contra `new Date()` sin argumentos y `Date.now()`, desactivada en `src/infrastructure/clock/**`; `no-restricted-imports` por capas (domain y application). Se ignora `provider/**` (servidor de prueba del enunciado). Comprobación manual: se crearon archivos temporales con imports prohibidos en domain/application y `new Date()`/`Date.now()` en `src/http`; `eslint src` falló con los errores esperados, `new Date(5)` y el uso dentro de `clock/` no dieron error; se borraron los temporales y `npm run lint` volvió a pasar.
- Arranque real: `node dist/main.js` con `PORT=3111`; `curl` a `/nada` devolvió 404 `{"error":"Not found"}` y un POST con JSON malformado devolvió 400 `{"error":"Invalid JSON body"}`; proceso detenido.
- `npm run lint`, `typecheck`, `test` y `build` pasan.
