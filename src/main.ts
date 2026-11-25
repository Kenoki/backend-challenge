import { Pool } from 'pg';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { createApp } from './http/app.js';
import type { Clock } from './application/ports/clock.js';
import { SystemClock } from './infrastructure/clock/system-clock.js';
import { TestClock } from './infrastructure/clock/test-clock.js';
import { makeCancelAppointment } from './application/cancel-appointment.js';
import { makeCreateClinic } from './application/create-clinic.js';
import { makeCreateAppointment } from './application/create-appointment.js';
import { makeCreatePatient } from './application/create-patient.js';
import { makeGetAppointment } from './application/get-appointment.js';
import { makeHandleInboundMessage } from './application/handle-inbound-message.js';
import { makeRescheduleAppointment } from './application/reschedule-appointment.js';
import { makeRunReminders } from './application/run-reminders.js';
import { KyselyAppointmentRepository } from './infrastructure/db/kysely-appointment-repository.js';
import { KyselyReminderQueue } from './infrastructure/db/kysely-reminder-queue.js';
import { KyselyUnitOfWork } from './infrastructure/db/kysely-unit-of-work.js';
import { KyselyPatientRepository } from './infrastructure/db/kysely-patient-repository.js';
import { createDb } from './infrastructure/db/database.js';
import { KyselyClinicRepository } from './infrastructure/db/kysely-clinic-repository.js';
import { migrate } from './infrastructure/db/migrator.js';
import { HttpMessageProvider } from './infrastructure/provider/http-message-provider.js';

const port = Number(process.env['PORT'] ?? 3000);
const databaseUrl = process.env['DATABASE_URL'];
// Por defecto, el proveedor fake de `docker compose` publicado en el host.
const providerUrl = process.env['PROVIDER_URL'] ?? 'http://localhost:4010';
const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

async function main(): Promise<void> {
  if (!databaseUrl) throw new Error('DATABASE_URL es obligatoria');
  const pool = new Pool({ connectionString: databaseUrl });
  await migrate(pool);
  logger.info('Migraciones aplicadas');

  // Única instancia del reloj; se inyecta en los casos de uso que necesitan la hora.
  const testClock = process.env['CLOCK_MODE'] === 'test' ? new TestClock() : undefined;
  const clock: Clock = testClock ?? new SystemClock();
  logger.info({ clockMode: testClock ? 'test' : 'system', now: clock.now().toISOString() }, 'Reloj del servicio');

  const db = createDb(pool);
  const clinics = new KyselyClinicRepository(db);
  const patients = new KyselyPatientRepository(db);
  const appointments = new KyselyAppointmentRepository(db);
  const unitOfWork = new KyselyUnitOfWork(db);
  const provider = new HttpMessageProvider(providerUrl);
  const reminderQueue = new KyselyReminderQueue(db);

  const app = createApp({
    logger,
    useCases: {
      createClinic: makeCreateClinic({ clinics }),
      createPatient: makeCreatePatient({ clinics, patients }),
      createAppointment: makeCreateAppointment({ unitOfWork, clock }),
      getAppointment: makeGetAppointment({ appointments }),
      rescheduleAppointment: makeRescheduleAppointment({ unitOfWork, clock }),
      cancelAppointment: makeCancelAppointment({ unitOfWork }),
      handleInboundMessage: makeHandleInboundMessage({ unitOfWork, clock }),
      runReminders: makeRunReminders({ queue: reminderQueue, provider, clock }),
    },
    ...(testClock && { testClock }),
    httpLogger: pinoHttp({ logger }),
    checkDatabase: async () => {
      await pool.query('SELECT 1');
    },
  });
  const server = app.listen(port, () => {
    logger.info({ port }, 'Server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Cerrando');
    server.close(() => {
      pool.end().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'No se pudo arrancar');
  process.exit(1);
});
