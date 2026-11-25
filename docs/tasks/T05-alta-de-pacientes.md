# T05 · Alta de pacientes

Estado: pendiente
Depende de: T04

## Historia

Como integrador de ClinicSay, quiero dar de alta pacientes de una clínica con su teléfono y su preferencia de recordatorios, para poder recordarles sus citas.

## Criterios de aceptación

- [ ] `POST /patients { clinicId, name, phone, acceptsReminders }` responde 201 con `{ id, clinicId, name, phone, acceptsReminders }`.
- [ ] `phone` admite un E.164 (`^\+[1-9]\d{7,14}$`) o `null`; si se omite, se guarda como `null`.
- [ ] Un teléfono que no es E.164 (`600111222`, `+0034...`) responde 400.
- [ ] Un `name` vacío o un `acceptsReminders` que no es booleano responden 400.
- [ ] Un `clinicId` que no existe, o que no es un UUID, responde 404.
- [ ] Los errores de validación (400) se comprueban antes que la existencia de la clínica (404).

## Notas para el implementador

- Value object `PhoneNumber` (E.164) en el dominio. La regex vive en un único sitio.

## Registro

_(lo rellena el implementador al terminar)_
