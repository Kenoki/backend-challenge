# T01 · Esqueleto del proyecto

Estado: pendiente
Depende de: —

## Historia

Como desarrollador del equipo, quiero un proyecto TypeScript con la estructura de capas, el lint, los tipos y los tests ya configurados, para poder añadir funcionalidad sin decidir de nuevo la base.

## Criterios de aceptación

- [ ] `package.json` exige Node ≥ 22 y define los scripts `build`, `start`, `dev`, `lint`, `typecheck`, `test`, `test:unit` y `test:integration`.
- [ ] `tsconfig.json` usa modo `strict` con `noUncheckedIndexedAccess` y compila `src/` a `dist/`.
- [ ] Existen las carpetas `src/domain`, `src/application`, `src/infrastructure`, `src/http` y `test/unit`, `test/integration`, más `src/main.ts` como composition root.
- [ ] ESLint (flat config con typescript-eslint) impide que `domain` importe de `application`, `infrastructure` o `http`, y que `application` importe de `infrastructure` o `http`.
- [ ] ESLint prohíbe `new Date()` y `Date.now()` fuera de `src/infrastructure/clock/`.
- [ ] ESLint aplica `complexity` con un máximo de 10.
- [ ] Vitest ejecuta un test unitario de ejemplo y `npm run lint`, `npm run typecheck` y `npm test` pasan.
- [ ] La app Express 5 arranca en `PORT` (por defecto 3000) y responde 404 con `{ "error": "Not found" }` a cualquier ruta desconocida.

## Notas para el implementador

- Dependencias: `express@5`, `zod`, `pino`, `pino-http`, `luxon`, `kysely` y `pg`. Para desarrollo: `typescript`, `tsx`, `vitest`, `@vitest/coverage-v8`, `eslint`, `typescript-eslint`, `eslint-plugin-boundaries` o `no-restricted-imports`, y los `@types` necesarios.
- No añadas lógica de negocio todavía.

## Registro

_(lo rellena el implementador al terminar)_
