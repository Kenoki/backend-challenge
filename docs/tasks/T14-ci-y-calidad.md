# T14 · CI y calidad del código

Estado: pendiente
Depende de: T01. Se puede adelantar y ampliar a medida que lleguen los tests.

## Historia

Como miembro del equipo, quiero que cada push compruebe el lint, los tipos, los tests y la calidad, para poder cambiar el código con confianza.

## Criterios de aceptación

- [ ] `.github/workflows/ci.yml` se ejecuta en cada push y en cada PR, con los jobs `lint`, `typecheck`, `test:unit` y `test:integration`. Este último usa servicios `postgres` y `provider`, o `docker compose`.
- [ ] El CI construye también la imagen Docker de `api`.
- [ ] La cobertura se genera con `@vitest/coverage-v8`, con un umbral mínimo del 90 % de líneas en `src/domain`.
- [ ] Ninguna función supera una complejidad ciclomática de 10 (ESLint `complexity`), lo que equivale a un CRAP < 10 con la cobertura del dominio.
- [ ] `jscpd` está configurado (`npm run dup`) y no reporta duplicados relevantes en `src/`.
- [ ] Stryker está configurado sobre `src/domain` (`npm run mutation`). Los mutantes supervivientes se eliminan con tests o se justifican en el registro.
- [ ] Hay un `.env.example` con todas las variables de entorno.

## Notas para el implementador

- Stryker puede ser lento: déjalo como script manual o como job de CI no bloqueante si supera unos 3 minutos.

## Registro

_(lo rellena el implementador al terminar)_
