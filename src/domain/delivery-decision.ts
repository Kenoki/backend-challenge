import type { SkipReason } from './reminder.js';

export interface DeliveryInput {
  readonly appointmentStartsAt: Date;
  readonly now: Date;
  readonly phone: string | null;
  readonly acceptsReminders: boolean;
}

export type DeliveryDecision =
  | { readonly kind: 'skip'; readonly reason: SkipReason }
  | { readonly kind: 'send'; readonly to: string };

/** Decide si un recordatorio se envía o se descarta. Precedencia: too_late, no_phone, opted_out. */
export function decideDelivery({ appointmentStartsAt, now, phone, acceptsReminders }: DeliveryInput): DeliveryDecision {
  if (appointmentStartsAt.getTime() <= now.getTime()) return { kind: 'skip', reason: 'too_late' };
  if (phone === null) return { kind: 'skip', reason: 'no_phone' };
  if (!acceptsReminders) return { kind: 'skip', reason: 'opted_out' };
  return { kind: 'send', to: phone };
}
