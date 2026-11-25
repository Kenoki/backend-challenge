import type { Kysely } from 'kysely';
import type { PatientRepository } from '../../application/ports/patient-repository.js';
import type { Patient } from '../../domain/patient.js';
import { PhoneNumber } from '../../domain/phone-number.js';
import { isUuid } from '../../domain/uuid.js';
import type { Database } from './database.js';

export class KyselyPatientRepository implements PatientRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async save(patient: Patient): Promise<void> {
    await this.db
      .insertInto('patients')
      .values({
        id: patient.id,
        clinic_id: patient.clinicId,
        name: patient.name,
        phone: patient.phone?.value ?? null,
        accepts_reminders: patient.acceptsReminders,
      })
      .execute();
  }

  async findById(id: string): Promise<Patient | null> {
    if (!isUuid(id)) return null;
    const row = await this.db.selectFrom('patients').selectAll().where('id', '=', id).executeTakeFirst();
    return row
      ? {
          id: row.id,
          clinicId: row.clinic_id,
          name: row.name,
          phone: row.phone === null ? null : PhoneNumber.parse(row.phone),
          acceptsReminders: row.accepts_reminders,
        }
      : null;
  }
}
