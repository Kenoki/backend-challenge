import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type UpdateObject } from 'kysely';
import type { ClaimedReminder, FailedAttempt, ReminderQueue } from '../../application/ports/reminder-queue.js';
import type { AppointmentStatus } from '../../domain/appointment.js';
import { isCurrent, type SkipReason } from '../../domain/reminder.js';
import { TimeZone } from '../../domain/time-zone.js';
import type { Database } from './database.js';

/** Lease del claim: se mide con el `now()` de Postgres, no con la hora del servicio (ADR 0001). */
const LEASE_SECONDS = 60;

interface ClaimedRow {
  id: string;
  attempts: number;
  for_starts_at: Date;
  starts_at: Date;
  appointment_status: AppointmentStatus;
  patient_name: string;
  phone: string | null;
  accepts_reminders: boolean;
  clinic_name: string;
  timezone: string;
}

const RELEASED = { claim_token: null, claimed_until: null } as const;
const CANCELLED = { status: 'cancelled', ...RELEASED } as const;

function failedAttemptChanges(next: FailedAttempt): UpdateObject<Database, 'reminders'> {
  return next.kind === 'retry' ? { next_attempt_at: next.at, ...RELEASED } : { status: 'failed', ...RELEASED };
}

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
        RETURNING id, appointment_id, attempts, for_starts_at
      )
      SELECT c.id, c.attempts, c.for_starts_at, a.starts_at, a.status AS appointment_status,
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
      forStartsAt: row.for_starts_at,
      appointmentStatus: row.appointment_status,
      appointmentStartsAt: row.starts_at,
      patientName: row.patient_name,
      phone: row.phone,
      acceptsReminders: row.accepts_reminders,
      clinicName: row.clinic_name,
      timeZone: TimeZone.parse(row.timezone),
    }));
  }

  recordAttempt(reminder: ClaimedReminder): Promise<boolean> {
    return this.ifStillClaimed(this.db, reminder, { attempts: sql<number>`attempts + 1` });
  }

  markSent(reminder: ClaimedReminder, sentAt: Date): Promise<boolean> {
    return this.ifStillClaimed(this.db, reminder, {
      status: 'sent',
      sent_at: sentAt,
      sent_seq: sql<string>`nextval('reminder_sent_seq')`,
      ...RELEASED,
    });
  }

  markSkipped(reminder: ClaimedReminder, reason: SkipReason): Promise<boolean> {
    return this.ifStillClaimed(this.db, reminder, { status: 'skipped', skip_reason: reason, ...RELEASED });
  }

  markCancelled(reminder: ClaimedReminder): Promise<boolean> {
    return this.ifStillClaimed(this.db, reminder, CANCELLED);
  }

  /**
   * Lee la cita con FOR SHARE y escribe en la misma transacción: cancelar o reprogramar bloquean la cita
   * con FOR UPDATE, así que o ocurren antes (y se ven aquí) o esperan a que esta escritura termine.
   * Si una cancelación concurrente aún no se ha confirmado, el reclamo del reintento la detecta.
   */
  settleFailedAttempt(reminder: ClaimedReminder, next: FailedAttempt): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const { rows } = await sql<{ for_starts_at: Date; starts_at: Date; status: AppointmentStatus }>`
        SELECT r.for_starts_at, a.starts_at, a.status
        FROM reminders r JOIN appointments a ON a.id = r.appointment_id
        WHERE r.id = ${reminder.id} AND r.claim_token = ${reminder.claimToken}
        FOR SHARE OF a`.execute(trx);
      const fresh = rows[0];
      if (!fresh) return false;
      const stillCurrent = isCurrent({
        forStartsAt: fresh.for_starts_at,
        appointmentStartsAt: fresh.starts_at,
        appointmentStatus: fresh.status,
      });
      return this.ifStillClaimed(trx, reminder, stillCurrent ? failedAttemptChanges(next) : CANCELLED);
    });
  }

  /** Única escritura de resultado: solo afecta a la fila si el `claim_token` sigue siendo el de esta pasada. */
  private async ifStillClaimed(
    executor: Kysely<Database>,
    reminder: ClaimedReminder,
    changes: UpdateObject<Database, 'reminders'>,
  ): Promise<boolean> {
    const result = await executor
      .updateTable('reminders')
      .set(changes)
      .where('id', '=', reminder.id)
      .where('claim_token', '=', reminder.claimToken)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
}
