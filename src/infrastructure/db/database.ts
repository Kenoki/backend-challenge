import type { ColumnType, Generated } from 'kysely';
import { Kysely, PostgresDialect } from 'kysely';
import type { Pool } from 'pg';

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface ClinicsTable {
  id: string;
  name: string;
  timezone: string;
}

export interface PatientsTable {
  id: string;
  clinic_id: string;
  name: string;
  phone: string | null;
  accepts_reminders: Generated<boolean>;
}

export interface AppointmentsTable {
  id: string;
  clinic_id: string;
  patient_id: string;
  starts_at: Timestamp;
  status: 'scheduled' | 'confirmed' | 'cancelled';
}

export interface RemindersTable {
  id: string;
  seq: Generated<string>;
  appointment_id: string;
  for_starts_at: Timestamp;
  scheduled_for: Timestamp;
  next_attempt_at: Timestamp;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled';
  skip_reason: 'too_late' | 'no_phone' | 'opted_out' | null;
  attempts: Generated<number>;
  sent_at: Timestamp | null;
  sent_seq: string | null;
  claim_token: string | null;
  claimed_until: Timestamp | null;
}

export interface InboundMessagesTable {
  message_id: string;
  received_at: Timestamp;
  outcome: string;
}

export interface Database {
  clinics: ClinicsTable;
  patients: PatientsTable;
  appointments: AppointmentsTable;
  reminders: RemindersTable;
  inbound_messages: InboundMessagesTable;
}

export function createDb(pool: Pool): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
