import type { Kysely, Selectable } from 'kysely';
import type { AppointmentRepository } from '../../application/ports/appointment-repository.js';
import type { Appointment } from '../../domain/appointment.js';
import type { Reminder } from '../../domain/reminder.js';
import { isUuid } from '../../domain/uuid.js';
import type { Database, RemindersTable } from './database.js';

function toReminder(row: Selectable<RemindersTable>): Reminder {
  const base = {
    id: row.id,
    forStartsAt: row.for_starts_at,
    scheduledFor: row.scheduled_for,
    nextAttemptAt: row.next_attempt_at,
    attempts: row.attempts,
  };
  switch (row.status) {
    case 'sent':
      if (row.sent_at === null) throw new Error(`Recordatorio sent sin sent_at: ${row.id}`);
      return { ...base, status: 'sent', sentAt: row.sent_at };
    case 'skipped':
      if (row.skip_reason === null) throw new Error(`Recordatorio skipped sin skip_reason: ${row.id}`);
      return { ...base, status: 'skipped', skipReason: row.skip_reason };
    default:
      return { ...base, status: row.status };
  }
}

export class KyselyAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  findById(id: string): Promise<Appointment | null> {
    return this.load(id, false);
  }

  findByIdForUpdate(id: string): Promise<Appointment | null> {
    return this.load(id, true);
  }

  async insert(appointment: Appointment): Promise<void> {
    await this.db
      .insertInto('appointments')
      .values({
        id: appointment.id,
        clinic_id: appointment.clinicId,
        patient_id: appointment.patientId,
        starts_at: appointment.startsAt,
        status: appointment.status,
      })
      .execute();
    for (const reminder of appointment.reminders) {
      await this.db
        .insertInto('reminders')
        .values({
          id: reminder.id,
          appointment_id: appointment.id,
          for_starts_at: reminder.forStartsAt,
          scheduled_for: reminder.scheduledFor,
          next_attempt_at: reminder.nextAttemptAt,
          status: reminder.status,
          skip_reason: reminder.status === 'skipped' ? reminder.skipReason : null,
          attempts: reminder.attempts,
          sent_at: reminder.status === 'sent' ? reminder.sentAt : null,
          sent_seq: null,
          claim_token: null,
          claimed_until: null,
        })
        .execute();
    }
  }

  private async load(id: string, forUpdate: boolean): Promise<Appointment | null> {
    if (!isUuid(id)) return null;
    let query = this.db.selectFrom('appointments').selectAll().where('id', '=', id);
    if (forUpdate) query = query.forUpdate();
    const row = await query.executeTakeFirst();
    if (!row) return null;
    const reminders = await this.db
      .selectFrom('reminders')
      .selectAll()
      .where('appointment_id', '=', id)
      .orderBy('seq', 'asc')
      .execute();
    return {
      id: row.id,
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      startsAt: row.starts_at,
      status: row.status,
      reminders: reminders.map(toReminder),
    };
  }
}
