import type { Kysely } from 'kysely';
import type { ClinicRepository } from '../../application/ports/clinic-repository.js';
import type { Clinic } from '../../domain/clinic.js';
import { TimeZone } from '../../domain/time-zone.js';
import type { Database } from './database.js';

export class KyselyClinicRepository implements ClinicRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async save(clinic: Clinic): Promise<void> {
    await this.db
      .insertInto('clinics')
      .values({ id: clinic.id, name: clinic.name, timezone: clinic.timeZone.name })
      .execute();
  }

  async findById(id: string): Promise<Clinic | null> {
    const row = await this.db.selectFrom('clinics').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? { id: row.id, name: row.name, timeZone: TimeZone.parse(row.timezone) } : null;
  }
}
