# T14 · CI y calidad del código

Estado: hecha
Depende de: T01. Se puede adelantar y ampliar a medida que lleguen los tests.

## Historia

Como miembro del equipo, quiero que cada push compruebe el lint, los tipos, los tests y la calidad, para poder cambiar el código con confianza.

## Criterios de aceptación

- [x] `.github/workflows/ci.yml` se ejecuta en cada push y en cada PR, con los jobs `lint`, `typecheck`, `test:unit` y `test:integration`. Este último usa servicios `postgres` y `provider`, o `docker compose`.
- [x] El CI construye también la imagen Docker de `api`.
- [x] La cobertura se genera con `@vitest/coverage-v8`, con un umbral mínimo del 90 % de líneas en `src/domain`.
- [x] Ninguna función supera una complejidad ciclomática de 10 (ESLint `complexity`), lo que equivale a un CRAP < 10 con la cobertura del dominio.
- [x] `jscpd` está configurado (`npm run dup`) y no reporta duplicados relevantes en `src/`.
- [x] Stryker está configurado sobre `src/domain` (`npm run mutation`). Los mutantes supervivientes se eliminan con tests o se justifican en el registro.
- [x] Hay un `.env.example` con todas las variables de entorno.

## Notas para el implementador

- Stryker puede ser lento: déjalo como script manual o como job de CI no bloqueante si supera unos 3 minutos.

## Registro

- `.github/workflows/ci.yml` (push, pull_request y workflow_dispatch): jobs `lint`, `typecheck`, `test:unit` (ejecuta `npm run test:coverage` y sube `coverage/`), `test:integration` (`docker compose up -d --build --wait db provider` con `DATABASE_URL` y `PROVIDER_URL` apuntando a localhost; así usa exactamente los mismos servicios que el compose), `docker-build` (`docker compose build api`), `duplicates` (`npm run dup`) y `mutation` con `continue-on-error` (no bloqueante). Node 22, `npm ci` y caché npm. Motivo: la forma más fiel y simple de tener Postgres y el provider reales. Comprobado con `yaml-lint` (sintaxis válida); el workflow no se ha podido ejecutar en GitHub desde aquí.
- Cobertura: `vitest.config.ts` con provider v8 y umbral de 90 % de líneas en `src/domain/**`; script `test:coverage` (solo tests unitarios). Comprobado: el dominio está al 100 % de líneas con los unitarios; el comando falla si baja del umbral (lo vi fallar al 80,95 % mientras T08/T09 estaban a medias).
- Complejidad: ya estaba `complexity: ['error', 10]` en ESLint. Comprobado con un archivo temporal (borrado) con una función de complejidad 12, que lint rechazó. Con el dominio al 100 % de cobertura, CRAP = complejidad, así que CRAP < 10 queda garantizado por el límite de 10 más la cobertura.
- jscpd 5.4.3: `.jscpd.json` sobre `src/` (minLines 8, minTokens 60, umbral 3 %), script `dup`. Resultado: 0 clones en 23 archivos.
- Stryker 10.1.1 (`core`, `vitest-runner`, `typescript-checker`): `stryker.config.json` sobre `src/domain/**/*.ts`, script `mutation`. Usa `vitest.mutation.config.ts` (solo `test/unit`, sin Postgres) y `tsconfig.mutation.json` (solo `src/domain`), para que el checker de tipos no dependa del resto del proyecto y la ejecución dure unos 25 s. Se añadió `vitest.mutation.config.ts` al `include` de `tsconfig.json` y `.stryker-tmp/`, `reports/` a `ignores` de ESLint y a `.gitignore`.
- Mutantes: la primera pasada (sin appointment.ts, aún en obras) dio 89,58 % con 5 supervivientes: mensajes de error de `phone-number.ts` y `time-zone.ts` vaciados, regex de `uuid.ts` sin `^` ni `$`, y `<` a `<=` en `reminder-schedule.ts` (hora 09:30 local). Los maté con `test/unit/domain-edge.test.ts` (UUID con texto sobrante, mensaje de error que nombra el valor inválido, recordatorio a las 09:30 que conserva los minutos); pasó a 100 % en esos archivos. Pasada final con todo el dominio: 95,95 % (71 muertos, 3 supervivientes, 41 errores de compilación que Stryker descarta). Los 3 supervivientes están en `appointment.ts` (solo el texto de mensajes de `ValidationError`/`ConflictError` en las líneas 21, 80 y 81); se reportan al responsable de T08/T09, no los toqué.
- Orquestador: los 3 supervivientes de `appointment.ts` (mensajes de error vaciados) se mataron añadiendo aserciones de mensaje en `test/unit/appointment-transitions.test.ts`, ya que el mensaje llega al cliente en `{ error }`. Mutation score final: 100 % (74 muertos, 0 supervivientes).
- `.env.example` con PORT, DATABASE_URL, PROVIDER_URL, CLOCK_MODE y LOG_LEVEL (comentadas).
- Verificación final: lint, typecheck, `npm test` (177 tests), `test:coverage` (87 unitarios, dominio 100 %), `dup` (0 clones), `mutation` (95,95 %) y `build` pasan.
