import { DateTime } from 'luxon';
import type { TimeZone } from './time-zone.js';

/**
 * Resultado de planificar un recordatorio. `scheduledFor` es siempre la hora de envío calculada
 * (día anterior, nunca antes de `now`, fuera de la franja silenciosa). En `too_late` es la hora
 * que habría correspondido, que ya no cabe antes del inicio de la cita.
 */
export type ReminderPlan =
  | { readonly status: 'pending'; readonly scheduledFor: Date }
  | { readonly status: 'skipped'; readonly skipReason: 'too_late'; readonly scheduledFor: Date };

export interface PlanReminderInput {
  readonly startsAt: Date;
  readonly timeZone: TimeZone;
  readonly now: Date;
}

const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 9;

/** Si `at` cae en la franja silenciosa [21:00, 09:00) local, la lleva a las 09:00:00.000 siguientes. */
function outOfQuietHours(at: DateTime): DateTime {
  if (at.hour >= QUIET_START_HOUR) {
    return at.plus({ days: 1 }).set({ hour: QUIET_END_HOUR }).startOf('hour');
  }
  if (at.hour < QUIET_END_HOUR) {
    return at.set({ hour: QUIET_END_HOUR }).startOf('hour');
  }
  return at;
}

export function planReminder({ startsAt, timeZone, now }: PlanReminderInput): ReminderPlan {
  const zone = timeZone.name;
  const sameTimeDayBefore = DateTime.fromJSDate(startsAt, { zone }).minus({ days: 1 });
  const notBeforeNow = DateTime.max(sameTimeDayBefore, DateTime.fromJSDate(now, { zone }));
  const scheduledFor = outOfQuietHours(notBeforeNow).toJSDate();

  return scheduledFor.getTime() >= startsAt.getTime()
    ? { status: 'skipped', skipReason: 'too_late', scheduledFor }
    : { status: 'pending', scheduledFor };
}
