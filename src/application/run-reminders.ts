import { decideDelivery } from '../domain/delivery-decision.js';
import { nextAttempt } from '../domain/retry-policy.js';
import { isCurrent } from '../domain/reminder.js';
import { reminderText } from '../domain/reminder-text.js';
import { forEachLimited } from './for-each-limited.js';
import type { Clock } from './ports/clock.js';
import type { DeliveryOutcome, MessageProvider } from './ports/message-provider.js';
import type { ClaimedReminder, ReminderQueue } from './ports/reminder-queue.js';

export type RunRemindersUseCase = () => Promise<{ processed: number }>;

export interface RunRemindersDeps {
  queue: ReminderQueue;
  provider: MessageProvider;
  clock: Clock;
  batchSize?: number;
  concurrency?: number;
}

/**
 * Caso de uso: una pasada de envío. Reclama los recordatorios vencidos por lotes, los procesa con
 * concurrencia limitada (la llamada al proveedor va fuera de toda transacción) y repite hasta que
 * no queden. Devuelve cuántos reclamó, incluidos los descartados.
 */
export function makeRunReminders(deps: RunRemindersDeps): RunRemindersUseCase {
  const { queue, provider, clock, batchSize = 50, concurrency = 10 } = deps;

  /** Guarda el resultado del intento; los no entregados los resuelve la cola con el estado de la cita al escribir. */
  async function settle(reminder: ClaimedReminder, outcome: DeliveryOutcome): Promise<void> {
    switch (outcome.kind) {
      case 'delivered':
        await queue.markSent(reminder, clock.now());
        return;
      case 'rejected':
        await queue.settleFailedAttempt(reminder, { kind: 'fail' });
        return;
      case 'retryable': {
        // El intento ya está contado (recordAttempt): attempts del reclamo + 1.
        const retryAt = nextAttempt(reminder.attempts + 1, clock.now());
        await queue.settleFailedAttempt(reminder, retryAt === 'give_up' ? { kind: 'fail' } : { kind: 'retry', at: retryAt });
        return;
      }
    }
  }

  async function process(reminder: ClaimedReminder): Promise<void> {
    if (!isCurrent(reminder)) {
      await queue.markCancelled(reminder);
      return;
    }
    const decision = decideDelivery({
      appointmentStartsAt: reminder.appointmentStartsAt,
      now: clock.now(),
      phone: reminder.phone,
      acceptsReminders: reminder.acceptsReminders,
    });
    if (decision.kind === 'skip') {
      await queue.markSkipped(reminder, decision.reason);
      return;
    }
    if (!(await queue.recordAttempt(reminder))) return;
    const text = reminderText({
      patientName: reminder.patientName,
      clinicName: reminder.clinicName,
      startsAt: reminder.appointmentStartsAt,
      timeZone: reminder.timeZone,
    });
    const outcome = await provider.send({ idempotencyKey: reminder.id, to: decision.to, text });
    await settle(reminder, outcome);
  }

  return async () => {
    const now = clock.now();
    let processed = 0;
    for (;;) {
      const batch = await queue.claimDue(now, batchSize);
      if (batch.length === 0) return { processed };
      processed += batch.length;
      await forEachLimited(batch, concurrency, process);
    }
  };
}
