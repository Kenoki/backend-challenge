import { TEST_DATABASE_URL } from '../support/database-url.js';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCancelAppointment } from '../../src/application/cancel-appointment.js';
import { makeCreateAppointment } from '../../src/application/create-appointment.js';
import { makeCreateClinic } from '../../src/application/create-clinic.js';
import { makeCreatePatient } from '../../src/application/create-patient.js';
import { makeGetAppointment } from '../../src/application/get-appointment.js';
import { makeRescheduleAppointment } from '../../src/application/reschedule-appointment.js';
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
  TEST_DATABASE_URL;
const pool = new Pool({ connectionString: databaseUrl });
const db = createDb(pool);
const clinics = new KyselyClinicRepository(db);
const patients = new KyselyPatientRepository(db);
const appointments = new KyselyAppointmentRepository(db);
const unitOfWork = new KyselyUnitOfWork(db);
const clock = new TestClock();

/** Unidad de trabajo cuyo `save` lanza después de guardar, para comprobar que la transacción se revierte. */
const failingAfterSaveUow: UnitOfWork = {
  run: (work) =>
    unitOfWork.run((repos) =>
      work({
        ...repos,
        appointments: {
          ...repos.appointments,
          save: async (appointment) => {
            await repos.appointments.save(appointment);
            throw new Error('fallo tras guardar');
          },
        },
      }),
    ),
};

function buildApp(uow: UnitOfWork = unitOfWork): ReturnType<typeof createApp> {
  return createApp({
    useCases: {
      createClinic: makeCreateClinic({ clinics }),
      createPatient: makeCreatePatient({ clinics, patients }),
      createAppointment: makeCreateAppointment({ unitOfWork: uow, clock }),
      getAppointment: makeGetAppointment({ appointments }),
      rescheduleAppointment: makeRescheduleAppointment({ unitOfWork: uow, clock }),
      cancelAppointment: makeCancelAppointment({ unitOfWork: uow }),
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

interface ReminderBody {
  id: string;
  scheduledFor: string;
  status: string;
  attempts: number;
  sentAt: string | null;
  skipReason: string | null;
}
interface AppointmentBody {
  id: string;
  startsAt: string;
  status: string;
  reminders: ReminderBody[];
}

async function newAppointment(startsAt = '2027-03-28T10:00:00+02:00'): Promise<AppointmentBody> {
  return (await post({ clinicId, patientId, startsAt })).body as AppointmentBody;
}

const patch = (id: string, body: Record<string, unknown>) => request(app).patch(`/appointments/${id}`).send(body);
const statusesOf = (body: unknown): string[] => (body as AppointmentBody).reminders.map((r) => r.status);
const getBody = async (id: string): Promise<unknown> => (await request(app).get(`/appointments/${id}`)).body;
const claimFirstReminder = (created: AppointmentBody, minutesFromNow: number) =>
  db
    .updateTable('reminders')
    .set({ claim_token: randomUUID(), claimed_until: sql<Date>`now() + make_interval(mins => ${minutesFromNow})` })
    .where('id', '=', created.reminders[0]!.id)
    .execute();

describe('PATCH /appointments/:id (reprogramar)', () => {
  it('200 con la cita actualizada: pendiente cancelado y uno nuevo para la nueva hora', async () => {
    const created = await newAppointment();

    const res = await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: created.id,
      clinicId,
      patientId,
      startsAt: '2027-04-10T08:00:00.000Z',
      status: 'scheduled',
      reminders: [
        { ...created.reminders[0], status: 'cancelled' },
        {
          id: anyUuid,
          scheduledFor: '2027-04-09T08:00:00.000Z',
          status: 'pending',
          attempts: 0,
          sentAt: null,
          skipReason: null,
        },
      ],
    });
    expect(await getBody(created.id)).toEqual(res.body);
  });

  it('conserva el enviado y añade uno nuevo: [sent, pending]', async () => {
    const created = await newAppointment();
    await db
      .updateTable('reminders')
      .set({ status: 'sent', sent_at: '2027-03-27T09:00:00.000Z' })
      .where('id', '=', created.reminders[0]!.id)
      .execute();

    const res = await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' });

    expect(res.status).toBe(200);
    expect(statusesOf(res.body)).toEqual(['sent', 'pending']);
    expect((res.body as AppointmentBody).reminders[0]).toEqual({
      ...created.reminders[0],
      status: 'sent',
      sentAt: '2027-03-27T09:00:00.000Z',
    });
  });

  it.each(['failed', 'skipped'] as const)('no cambia un recordatorio %s', async (status) => {
    const created = await newAppointment();
    await db
      .updateTable('reminders')
      .set({ status, skip_reason: status === 'skipped' ? 'no_phone' : null })
      .where('id', '=', created.reminders[0]!.id)
      .execute();

    const res = await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' });

    expect(statusesOf(res.body)).toEqual([status, 'pending']);
  });

  it('una cita confirmed vuelve a scheduled', async () => {
    const created = await newAppointment();
    await db.updateTable('appointments').set({ status: 'confirmed' }).where('id', '=', created.id).execute();

    const res = await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' });

    expect((res.body as AppointmentBody).status).toBe('scheduled');
  });

  it('el nuevo recordatorio es skipped too_late si ya no cabe', async () => {
    const created = await newAppointment();
    clock.set(new Date('2027-03-27T21:00:00.000Z'));

    const res = await patch(created.id, { startsAt: '2027-03-28T08:00:00+02:00' });

    expect(res.status).toBe(200);
    expect((res.body as AppointmentBody).reminders.at(-1)).toMatchObject({
      status: 'skipped',
      skipReason: 'too_late',
    });
  });

  it('reprogramar a la misma hora es una reprogramación normal', async () => {
    const created = await newAppointment();

    const res = await patch(created.id, { startsAt: '2027-03-28T10:00:00+02:00' });

    expect(res.status).toBe(200);
    expect(statusesOf(res.body)).toEqual(['cancelled', 'pending']);
  });

  it.each([
    ['sin startsAt', {}],
    ['sin zona', { startsAt: '2027-04-10T10:00:00' }],
    ['inválido', { startsAt: 'mañana' }],
    ['no string', { startsAt: 12345 }],
  ])('400 si el cuerpo es inválido (%s), incluso antes que el 404', async (_name, body) => {
    const created = await newAppointment();

    expect((await patch(created.id, body)).status).toBe(400);
    expect((await patch(randomUUID(), body)).status).toBe(400);
  });

  it('404 si la cita no existe o el id no es un UUID, antes que el 400 de no futuro', async () => {
    const body = { startsAt: '2027-02-28T10:00:00Z' };

    expect((await patch(randomUUID(), body)).status).toBe(404);
    expect((await patch('abc', body)).status).toBe(404);
  });

  it('409 si la cita está cancelada, antes que el 400 de no futuro', async () => {
    const created = await newAppointment();
    await db.updateTable('appointments').set({ status: 'cancelled' }).where('id', '=', created.id).execute();

    expect((await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' })).status).toBe(409);
    expect((await patch(created.id, { startsAt: '2027-02-28T10:00:00Z' })).status).toBe(409);
  });

  it('409 si la cita ya empezó, antes que el 400 de no futuro', async () => {
    const created = await newAppointment();
    clock.set(new Date('2027-03-28T08:00:00.000Z'));

    expect((await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' })).status).toBe(409);
    expect((await patch(created.id, { startsAt: '2027-03-01T10:00:00Z' })).status).toBe(409);
  });

  it('400 si la nueva hora no es futura o es igual a ahora, sin modificar nada', async () => {
    const created = await newAppointment();

    expect((await patch(created.id, { startsAt: '2027-02-28T10:00:00Z' })).status).toBe(400);
    expect((await patch(created.id, { startsAt: '2027-03-01T00:00:00Z' })).status).toBe(400);
    expect(await getBody(created.id)).toEqual(created);
  });

  it('no cancela un recordatorio en vuelo (claim vigente) pero sí cambia la cita y añade el nuevo', async () => {
    const created = await newAppointment();
    await claimFirstReminder(created, 1);

    const res = await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' });

    expect(res.status).toBe(200);
    expect(statusesOf(res.body)).toEqual(['pending', 'pending']);
    expect((res.body as AppointmentBody).startsAt).toBe('2027-04-10T08:00:00.000Z');
  });

  it('cancela un recordatorio con claim caducado (ya no está en vuelo)', async () => {
    const created = await newAppointment();
    await claimFirstReminder(created, -1);

    const res = await patch(created.id, { startsAt: '2027-04-10T10:00:00+02:00' });

    expect(statusesOf(res.body)).toEqual(['cancelled', 'pending']);
  });

  it('es atómico: si falla tras guardar, la cita y sus recordatorios quedan como estaban', async () => {
    const created = await newAppointment();
    const res = await request(buildApp(failingAfterSaveUow))
      .patch(`/appointments/${created.id}`)
      .send({ startsAt: '2027-04-10T10:00:00+02:00' });

    expect(res.status).toBe(500);
    expect(await getBody(created.id)).toEqual(created);
  });
});

const cancel = (id: string) => request(app).post(`/appointments/${id}/cancel`);
const countReminders = async (id: string): Promise<number> =>
  (await db.selectFrom('reminders').select('id').where('appointment_id', '=', id).execute()).length;

describe('POST /appointments/:id/cancel', () => {
  it('200 con la cita cancelled y su recordatorio pending cancelled', async () => {
    const created = await newAppointment();

    const res = await cancel(created.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...created,
      status: 'cancelled',
      reminders: [{ ...created.reminders[0], status: 'cancelled' }],
    });
    expect(await getBody(created.id)).toEqual(res.body);
  });

  it('no cambia los recordatorios sent, failed ni skipped', async () => {
    const created = await newAppointment();
    await db
      .updateTable('reminders')
      .set({ status: 'sent', sent_at: '2027-03-27T09:00:00.000Z' })
      .where('id', '=', created.reminders[0]!.id)
      .execute();

    const res = await cancel(created.id);

    expect(res.status).toBe(200);
    expect((res.body as AppointmentBody).status).toBe('cancelled');
    expect(statusesOf(res.body)).toEqual(['sent']);
  });

  it('cancelar una cita ya cancelada responde 200 y no modifica nada', async () => {
    const created = await newAppointment();
    const first = await cancel(created.id);

    const second = await cancel(created.id);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await countReminders(created.id)).toBe(1);
  });

  it('permite cancelar una cita que ya empezó', async () => {
    const created = await newAppointment();
    clock.set(new Date('2027-03-29T00:00:00.000Z'));

    const res = await cancel(created.id);

    expect(res.status).toBe(200);
    expect((res.body as AppointmentBody).status).toBe('cancelled');
  });

  it('cancela una cita confirmed', async () => {
    const created = await newAppointment();
    await db.updateTable('appointments').set({ status: 'confirmed' }).where('id', '=', created.id).execute();

    expect(((await cancel(created.id)).body as AppointmentBody).status).toBe('cancelled');
  });

  it('404 si la cita no existe o el id no es un UUID', async () => {
    expect((await cancel(randomUUID())).status).toBe(404);
    expect((await cancel('abc')).status).toBe(404);
  });

  it('no cancela un recordatorio en vuelo, pero sí la cita', async () => {
    const created = await newAppointment();
    await claimFirstReminder(created, 1);

    const res = await cancel(created.id);

    expect(res.status).toBe(200);
    expect((res.body as AppointmentBody).status).toBe('cancelled');
    expect(statusesOf(res.body)).toEqual(['pending']);
  });

  it('es atómico: si falla tras guardar, la cita queda como estaba', async () => {
    const created = await newAppointment();
    const res = await request(buildApp(failingAfterSaveUow)).post(`/appointments/${created.id}/cancel`);

    expect(res.status).toBe(500);
    expect(await getBody(created.id)).toEqual(created);
  });
});
