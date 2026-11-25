# Recordatorios de citas

Lenguaje del dominio de ClinicSay para recordar citas por mensaje el día anterior y recoger la confirmación o cancelación del paciente. Entre paréntesis, el identificador usado en el código y en el contrato.

## Agenda

**Clínica** (`Clinic`):
Centro que atiende pacientes; tiene una zona horaria IANA que gobierna todas las horas locales de sus citas y recordatorios.
_Evitar_: centro, consulta

**Paciente** (`Patient`):
Persona atendida por una única clínica; puede tener teléfono y aceptar o no recordatorios.
_Evitar_: cliente, usuario

**Cita** (`Appointment`):
Reserva de un paciente en su clínica para un instante de inicio (`startsAt`). Está `scheduled`, `confirmed` o `cancelled`.
_Evitar_: reserva, turno

**Reprogramación** (`reschedule`):
Cambio del inicio de una cita que no ha empezado ni está cancelada; anula su recordatorio pendiente, conserva los ya enviados, genera uno nuevo y devuelve la cita a `scheduled`.
_Evitar_: mover, editar cita

**Cita empezada**:
Cita cuyo inicio es igual o anterior a la hora actual del servicio.

## Recordatorios

**Recordatorio** (`Reminder`):
Mensaje que avisa al paciente de una cita; cada cita tiene un recordatorio vigente para su inicio actual y conserva el historial de los anteriores.
_Evitar_: notificación, aviso

**Recordatorio vigente**:
El recordatorio creado para el inicio actual de la cita; los anteriores quedan en su historial.

**Pendiente** (`pending`):
Recordatorio que espera su hora de envío o su siguiente reintento.

**En vuelo**:
Recordatorio pendiente cuyo intento está haciendo una pasada en este momento; reprogramar o cancelar la cita no lo anula, pero si ese intento falla ya no se reintenta.

**Hora de envío** (`scheduledFor`):
Instante previsto para enviar un recordatorio: la misma hora local del día anterior a la cita, desplazada fuera de la franja silenciosa y nunca antes de su creación.

**Franja silenciosa**:
Intervalo de 21:00 a 09:00 (hora local de la clínica, 09:00 excluidas) en el que no se envía ningún primer intento.
_Evitar_: horario nocturno, ventana prohibida

**Intento** (`attempt`):
Cada llamada al proveedor para entregar un recordatorio; un recordatorio admite como máximo tres.

**Reintento**:
Intento posterior a un fallo transitorio del proveedor, 1 minuto tras el primer fallo y 5 minutos tras el segundo; no respeta la franja silenciosa.

**Descartado** (`skipped`):
Recordatorio que no se envía por una razón del dominio: `too_late` (no cabe antes del inicio), `no_phone` (paciente sin teléfono) u `opted_out` (paciente que no acepta recordatorios).
_Evitar_: omitido, ignorado

**Fallido** (`failed`):
Recordatorio que el proveedor rechazó o que agotó sus intentos.

**Cancelado** (`cancelled`):
Recordatorio pendiente anulado porque su cita se reprogramó o se canceló antes de enviarlo.
_Evitar_: anulado, borrado

**Enviado** (`sent`):
Recordatorio que el proveedor aceptó; su `sentAt` es la hora del servicio en ese momento.
_Evitar_: entregado

**Pasada** (`ReminderRun`):
Ejecución que trata todos los recordatorios a los que les toca según la hora del servicio: los envía, los reintenta o los descarta. Puede haber varias simultáneas.
_Evitar_: job, batch, cron

## Mensajería

**Proveedor** (`MessageProvider`):
Servicio externo que entrega mensajes al teléfono del paciente y avisa de sus respuestas.
_Evitar_: gateway, WhatsApp

**Respuesta del paciente** (`InboundMessage`):
Mensaje que un paciente envía desde su teléfono, identificado por un `messageId` único; solo `SI` (confirma) y `NO` (cancela) tienen efecto.

**Cita destino**:
Cita a la que se aplica una respuesta del paciente: la del recordatorio enviado más recientemente a ese teléfono entre las citas no empezadas ni canceladas.

**Hora del servicio** (`Clock`):
Instante que el servicio toma como "ahora" para crear citas, pasadas y respuestas; en modo de pruebas lo fija `PUT /test/clock` y queda congelado hasta el siguiente cambio.
_Evitar_: hora del sistema
