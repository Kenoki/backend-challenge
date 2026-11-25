import { DateTime } from 'luxon';
import type { TimeZone } from './time-zone.js';

export interface ReminderTextInput {
  readonly patientName: string;
  readonly clinicName: string;
  readonly startsAt: Date;
  readonly timeZone: TimeZone;
}

/** Texto del recordatorio, con la fecha y la hora de la cita en la zona horaria de la clínica. */
export function reminderText({ patientName, clinicName, startsAt, timeZone }: ReminderTextInput): string {
  const local = DateTime.fromJSDate(startsAt, { zone: timeZone.name });
  const date = local.toFormat('dd/MM/yyyy');
  const time = local.toFormat('HH:mm');
  return `Hola ${patientName}, te recordamos tu cita en ${clinicName} el ${date} a las ${time}. Responde SI para confirmar o NO para cancelar.`;
}
