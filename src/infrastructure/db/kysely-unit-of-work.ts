import type { Kysely } from 'kysely';
import type { Repositories, UnitOfWork } from '../../application/ports/unit-of-work.js';
import type { Database } from './database.js';
import { KyselyAppointmentRepository } from './kysely-appointment-repository.js';
import { KyselyClinicRepository } from './kysely-clinic-repository.js';
import { KyselyInboundMessageRepository } from './kysely-inbound-message-repository.js';
import { KyselyPatientRepository } from './kysely-patient-repository.js';

/** Unidad de trabajo sobre `db.transaction()`: los repositorios de `work` comparten la transacción. */
export class KyselyUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Kysely<Database>) {}

  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction().execute((trx) =>
      work({
        clinics: new KyselyClinicRepository(trx),
        patients: new KyselyPatientRepository(trx),
        appointments: new KyselyAppointmentRepository(trx),
        inboundMessages: new KyselyInboundMessageRepository(trx),
      }),
    );
  }
}
