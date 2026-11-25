import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCreateAppointment } from '../../src/application/create-appointment.js';
import { makeCreateClinic } from '../../src/application/create-clinic.js';
import { makeCreatePatient } from '../../src/application/create-patient.js';
import { makeGetAppointment } from '../../src/application/get-appointment.js';
import type { UnitOfWork } from '../../src/application/ports/unit-of-work.js';
import { createApp } from '../../src/http/app.js';
import { TestClock } from '../../src/infrastructure/clock/test-clock.js';
import { createDb } from '../../src/infrastructure/db/database.js';
import { KyselyAppointmentRepository } from '../../src/infrastructure/db/kysely-appointment-repository.js';
import { KyselyClinicRepository } from '../../src/infrastructure/db/kysely-clinic-repository.js';
import { KyselyPatientRepository } from '../../src/infrastructure/db/kysely-patient-repository.js';
import { KyselyUnitOfWork } from '../../src/infrastructure/db/kysely-unit-of-work.js';
import { migrate } from '../../src/infrastructure/db/migrator.js';

const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const pool = new Pool({ connectionString: databaseUrl });
const db = createDb(pool);
const clinics = new KyselyClinicRepository(db);
const patients = new KyselyPatientRepository(db);
const appointments = new KyselyAppointmentRepository(db);
const unitOfWork = new KyselyUnitOfWork(db);
const clock = new TestClock();

function buildApp(uow: UnitOfWork = unitOfWork): ReturnType<typeof createApp> {
  return createApp({
    useCases: {
      createClinic: makeCreateClinic({ clinics }),
      createPatient: makeCreatePatient({ clinics, patients }),
      createAppointment: makeCreateAppointment({ unitOfWork: uow, clock }),
      getAppointment: makeGetAppointment({ appointments }),
    },
  });
}
const app = buildApp();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const anyUuid = expect.stringMatching(UUID) as string;
const idOf = (res: request.Response): string => (res.body as { id: string }).id;

async function newClinic(timezone = 'Europe/Madrid'): Promise<string> {
  const res = await request(app).post('/clinics').send({ name: `Clínica ${randomUUID()}`, timezone });
  return idOf(res);
}

async function newPatient(clinicId: string): Promise<string> {
  const res = await request(app)
    .post('/patients')
    .send({ clinicId, name: 'Ana', phone: '+34600111222', acceptsReminders: true });
  return idOf(res);
}

let clinicId: string;
let patientId: string;

beforeAll(async () => {
  await migrate(pool);
  clinicId = await newClinic();
  patientId = await newPatient(clinicId);
});

beforeEach(() => {
  clock.set(new Date('2027-03-01T00:00:00.000Z'));
});

afterAll(async () => {
  await pool.end();
});

const post = (body: Record<string, unknown>) => request(app).post('/appointments').send(body);

describe('POST /appointments', () => {
  it('crea la cita con un recordatorio pending y todo en UTC con Z', async () => {
    const res = await post({ clinicId, patientId, startsAt: '2027-03-28T10:00:00+02:00' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: anyUuid,
      clinicId,
      patientId,
      startsAt: '2027-03-28T08:00:00.000Z',
      status: 'scheduled',
      reminders: [
        {
          id: anyUuid,
          scheduledFor: '2027-03-27T09:00:00.000Z',
          status: 'pending',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
      ],
    });
  });

  it('crea el recordatorio skipped too_late cuando ya no cabe (22:00 locales la víspera de una cita a las 08:00)', async () => {
    clock.set(new Date('2027-02-09T21:00:00.000Z'));

    const res = await post({ clinicId, patientId, startsAt: '2027-02-10T08:00:00+01:00' });

    expect(res.status).toBe(201);
    expect((res.body as { reminders: unknown[] }).reminders).toEqual([
      {
        id: anyUuid,
        scheduledFor: '2027-02-10T08:00:00.000Z',
        status: 'skipped',
        attempts: 0,
        sentAt: null,
        skipReason: 'too_late',
      },
    ]);
  });

  it.each([
    ['sin zona', '2027-03-28T10:00:00'],
    ['inválido', 'mañana'],
    ['fecha imposible', '2027-13-45T10:00:00Z'],
    ['no string', 12345],
  ])('400 si startsAt es %s', async (_name, startsAt) => {
    const res = await post({ clinicId, patientId, startsAt });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body as object)).toEqual(['error']);
  });

  it('400 si startsAt está en el pasado o es igual a ahora', async () => {
    expect((await post({ clinicId, patientId, startsAt: '2027-02-28T10:00:00Z' })).status).toBe(400);
    expect((await post({ clinicId, patientId, startsAt: '2027-03-01T00:00:00Z' })).status).toBe(400);
  });

  it('400 por startsAt no futuro antes que 404 por clínica inexistente', async () => {
    const res = await post({ clinicId: randomUUID(), patientId, startsAt: '2027-02-28T10:00:00Z' });

    expect(res.status).toBe(400);
  });

  it('404 si la clínica no existe o no es un UUID', async () => {
    const startsAt = '2027-03-28T10:00:00Z';
    expect((await post({ clinicId: randomUUID(), patientId, startsAt })).status).toBe(404);
    expect((await post({ clinicId: 'abc', patientId, startsAt })).status).toBe(404);
  });

  it('404 si el paciente no existe o no es un UUID', async () => {
    const startsAt = '2027-03-28T10:00:00Z';
    expect((await post({ clinicId, patientId: randomUUID(), startsAt })).status).toBe(404);
    expect((await post({ clinicId, patientId: 'abc', startsAt })).status).toBe(404);
  });

  it('400 si el paciente es de otra clínica', async () => {
    const otherClinic = await newClinic('Atlantic/Canary');

    const res = await post({ clinicId: otherClinic, patientId, startsAt: '2027-03-28T10:00:00Z' });

    expect(res.status).toBe(400);
  });

  it('guarda cita y recordatorio en la misma transacción: si falla algo, no queda ninguno', async () => {
    const failingUow: UnitOfWork = {
      run: (work) =>
        unitOfWork.run((repos) =>
          work({
            ...repos,
            appointments: {
              ...repos.appointments,
              insert: async (appointment) => {
                await repos.appointments.insert(appointment);
                throw new Error('fallo tras insertar cita y recordatorio');
              },
            },
          }),
        ),
    };
    const patient = await newPatient(clinicId);

    const res = await request(buildApp(failingUow))
      .post('/appointments')
      .send({ clinicId, patientId: patient, startsAt: '2027-03-28T10:00:00Z' });

    expect(res.status).toBe(500);
    const rows = await db.selectFrom('appointments').select('id').where('patient_id', '=', patient).execute();
    expect(rows).toEqual([]);
    const reminders = await db
      .selectFrom('reminders')
      .innerJoin('appointments', 'appointments.id', 'reminders.appointment_id')
      .select('reminders.id')
      .where('appointments.patient_id', '=', patient)
      .execute();
    expect(reminders).toEqual([]);
  });
});

describe('GET /appointments/:id', () => {
  it('devuelve la misma cita que se creó', async () => {
    const created = await post({ clinicId, patientId, startsAt: '2027-03-28T10:00:00+02:00' });

    const res = await request(app).get(`/appointments/${idOf(created)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  it('404 si no existe', async () => {
    expect((await request(app).get(`/appointments/${randomUUID()}`)).status).toBe(404);
  });

  it('404 si el id no es un UUID', async () => {
    expect((await request(app).get('/appointments/abc')).status).toBe(404);
  });

  it('devuelve los recordatorios ordenados por seq ascendente', async () => {
    const created = await post({ clinicId, patientId, startsAt: '2027-03-28T10:00:00+02:00' });
    const appointmentId = idOf(created);
    const second = randomUUID();
    const first = (created.body as { reminders: { id: string }[] }).reminders[0]!.id;
    await db
      .insertInto('reminders')
      .values({
        id: second,
        appointment_id: appointmentId,
        for_starts_at: '2027-03-29T08:00:00.000Z',
        scheduled_for: '2027-03-28T09:00:00.000Z',
        next_attempt_at: '2027-03-28T09:00:00.000Z',
        status: 'cancelled',
        skip_reason: null,
        sent_at: null,
        sent_seq: null,
        claim_token: null,
        claimed_until: null,
      })
      .execute();

    const res = await request(app).get(`/appointments/${appointmentId}`);

    expect((res.body as { reminders: { id: string }[] }).reminders.map((r) => r.id)).toEqual([first, second]);
  });
});

describe('AppointmentRepository.findByIdForUpdate', () => {
  it('devuelve el agregado dentro de la transacción y null si no existe', async () => {
    const created = await post({ clinicId, patientId, startsAt: '2027-03-28T10:00:00Z' });
    const id = idOf(created);

    const [found, missing, malformed] = await unitOfWork.run(async ({ appointments: repo }) => [
      await repo.findByIdForUpdate(id),
      await repo.findByIdForUpdate(randomUUID()),
      await repo.findByIdForUpdate('abc'),
    ]);

    expect(found).toEqual(await appointments.findById(id));
    expect(found?.reminders).toHaveLength(1);
    expect(missing).toBeNull();
    expect(malformed).toBeNull();
  });
});
