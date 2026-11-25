import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type UpdateObject } from 'kysely';
import type { ClaimedReminder, ReminderQueue } from '../../application/ports/reminder-queue.js';
import type { SkipReason } from '../../domain/reminder.js';
import { TimeZone } from '../../domain/time-zone.js';
import type { Database } from './database.js';

/** Lease del claim: se mide con el `now()` de Postgres, no con la hora del servicio (ADR 0001). */
const LEASE_SECONDS = 60;

interface ClaimedRow {
  id: string;
  attempts: number;
  starts_at: Date;
  patient_name: string;
  phone: string | null;
  accepts_reminders: boolean;
  clinic_name: string;
  timezone: string;
}

const RELEASED = { claim_token: null, claimed_until: null } as const;

export class KyselyReminderQueue implements ReminderQueue {
  constructor(private readonly db: Kysely<Database>) {}

  /** Un único UPDATE ... FOR UPDATE SKIP LOCKED: varias pasadas a la vez nunca reclaman el mismo recordatorio. */
  async claimDue(now: Date, limit: number): Promise<ClaimedReminder[]> {
    const claimToken = randomUUID();
    const { rows } = await sql<ClaimedRow>`
      WITH claimed AS (
        UPDATE reminders
        SET claim_token = ${claimToken}, claimed_until = now() + make_interval(secs => ${LEASE_SECONDS})
        WHERE id IN (
          SELECT id FROM reminders
          WHERE status = 'pending'
            AND next_attempt_at <= ${now}
            AND (claim_token IS NULL OR claimed_until <= now())
          ORDER BY next_attempt_at, seq
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        RETURNING id, appointment_id, attempts
      )
      SELECT c.id, c.attempts, a.starts_at,
             p.name AS patient_name, p.phone, p.accepts_reminders,
             cl.name AS clinic_name, cl.timezone
      FROM claimed c
      JOIN appointments a ON a.id = c.appointment_id
      JOIN patients p ON p.id = a.patient_id
      JOIN clinics cl ON cl.id = a.clinic_id`.execute(this.db);
    return rows.map((row) => ({
      id: row.id,
      claimToken,
      attempts: row.attempts,
      appointmentStartsAt: row.starts_at,
      patientName: row.patient_name,
      phone: row.phone,
      acceptsReminders: row.accepts_reminders,
      clinicName: row.clinic_name,
      timeZone: TimeZone.parse(row.timezone),
    }));
  }

  recordAttempt(reminder: ClaimedReminder): Promise<boolean> {
    return this.ifStillClaimed(reminder, { attempts: sql<number>`attempts + 1` });
  }

  markSent(reminder: ClaimedReminder, sentAt: Date): Promise<boolean> {
    return this.ifStillClaimed(reminder, {
      status: 'sent',
      sent_at: sentAt,
      sent_seq: sql<string>`nextval('reminder_sent_seq')`,
      ...RELEASED,
    });
  }

  markSkipped(reminder: ClaimedReminder, reason: SkipReason): Promise<boolean> {
    return this.ifStillClaimed(reminder, { status: 'skipped', skip_reason: reason, ...RELEASED });
  }

  markFailed(reminder: ClaimedReminder): Promise<boolean> {
    return this.ifStillClaimed(reminder, { status: 'failed', ...RELEASED });
  }

  scheduleRetry(reminder: ClaimedReminder, nextAttemptAt: Date): Promise<boolean> {
    return this.ifStillClaimed(reminder, { next_attempt_at: nextAttemptAt, ...RELEASED });
  }

  /** Única escritura de resultado: solo afecta a la fila si el `claim_token` sigue siendo el de esta pasada. */
  private async ifStillClaimed(
    reminder: ClaimedReminder,
    changes: UpdateObject<Database, 'reminders'>,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('reminders')
      .set(changes)
      .where('id', '=', reminder.id)
      .where('claim_token', '=', reminder.claimToken)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
}
