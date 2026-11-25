# T17 · Entrega

Estado: pendiente
Depende de: T16

## Historia

Como candidato, quiero dejar el último commit en `main` del repositorio público antes del plazo, para que se evalúe la versión completa.

## Criterios de aceptación

- [ ] Desde un clon limpio, `docker compose up --build` levanta todo y `GET /health` devuelve 200.
- [ ] Se ha recorrido a mano el flujo completo con `curl`: crear clínica, paciente y cita, avanzar el reloj, lanzar una pasada, comprobar el mensaje en el `provider` y responder `SI` por el webhook.
- [ ] El CI está en verde en `develop`.
- [ ] `develop` se ha mergeado a `main` y se ha hecho push a `origin` antes del 25/11/2026 a las 17:30 de Madrid. Antes del push se pide confirmación.
- [ ] El repositorio es público y su enlace está en el formulario de entrega. Esto lo hace el candidato.

## Registro

_(lo rellena el orquestador al terminar)_
