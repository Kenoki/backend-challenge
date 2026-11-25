# T17 · Entrega

Estado: hecha
Depende de: T16

## Historia

Como candidato, quiero dejar el último commit en `main` del repositorio público antes del plazo, para que se evalúe la versión completa.

## Criterios de aceptación

- [x] Desde un clon limpio, `docker compose up --build` levanta todo y `GET /health` devuelve 200.
- [x] Se ha recorrido a mano el flujo completo con `curl`: crear clínica, paciente y cita, avanzar el reloj, lanzar una pasada, comprobar el mensaje en el `provider` y responder `SI` por el webhook.
- [x] El CI está en verde en `develop`.
- [x] `develop` se ha mergeado a `main` y se ha hecho push a `origin` antes del 25/11/2026 a las 17:30 de Madrid. Antes del push se pide confirmación.
- [ ] El repositorio es público y su enlace está en el formulario de entrega. Esto lo hace el candidato.

## Registro

- Clon limpio de `develop` desde GitHub en un directorio temporal, `docker compose up --build` con otro nombre de proyecto: los logs muestran "Base de datos creada", "Migraciones aplicadas" y "Server listening", y `GET /health` devolvió 200.
- Flujo completo contra ese clon con un script que valida cada respuesta contra `openapi.yaml` (alta de clínica, paciente y cita, reloj, pasada, cita `sent`, respuesta `SI` por el webhook, reprogramar, cancelar y casos de error): 26 de 27 conformes; la diferencia es el 400 de `PUT /test/clock` con cuerpo inválido, que el contrato no lista y se mantiene a propósito. El recorrido con `curl` del README se comprobó en T16.
- CI de `develop` en verde (7 jobs) tras el último commit.
- El candidato confirmó la entrega; el orquestador mergeó `develop` en `main` y subió ambas ramas.
