import { TEST_DATABASE_URL } from '../support/database-url.js';
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
import { makeRunReminders } from '../../src/application/run-reminders.js';
import { createApp } from '../../src/http/app.js';
import { TestClock } from '../../src/infrastructure/clock/test-clock.js';
import { createDb } from '../../src/infrastructure/db/database.js';
import { KyselyAppointmentRepository } from '../../src/infrastructure/db/kysely-appointment-repository.js';
import { KyselyClinicRepository } from '../../src/infrastructure/db/kysely-clinic-repository.js';
import { KyselyPatientRepository } from '../../src/infrastructure/db/kysely-patient-repository.js';
import { KyselyReminderQueue } from '../../src/infrastructure/db/kysely-reminder-queue.js';
import { KyselyUnitOfWork } from '../../src/infrastructure/db/kysely-unit-of-work.js';
import { migrate } from '../../src/infrastructure/db/migrator.js';
import { HttpMessageProvider } from '../../src/infrastructure/provider/http-message-provider.js';

const databaseUrl = TEST_DATABASE_URL;
const providerUrl = process.env['PROVIDER_URL'] ?? 'http://localhost:4010';
const pool = new Pool({ connectionString: databaseUrl });
const db = createDb(pool);
const clinics = new KyselyClinicRepository(db);
const patients = new KyselyPatientRepository(db);
const appointments = new KyselyAppointmentRepository(db);
const unitOfWork = new KyselyUnitOfWork(db);
const clock = new TestClock();

const app = createApp({
  useCases: {
    createClinic: makeCreateClinic({ clinics }),
    createPatient: makeCreatePatient({ clinics, patients }),
    createAppointment: makeCreateAppointment({ unitOfWork, clock }),
    getAppointment: makeGetAppointment({ appointments }),
    rescheduleAppointment: makeRescheduleAppointment({ unitOfWork, clock }),
    cancelAppointment: makeCancelAppointment({ unitOfWork }),
    runReminders: makeRunReminders({
      queue: new KyselyReminderQueue(db),
      provider: new HttpMessageProvider(providerUrl),
      clock,
    }),
  },
});

// Cita el 17/06/2027 a las 10:00 en Madrid: el recordatorio se programa el 16/06/2027 a las 10:00 (08:00Z).
const STARTS_AT = '2027-06-17T08:00:00.000Z';
const SEND_TIME = '2027-06-16T08:00:00.000Z';
const CREATED_AT = '2027-06-01T00:00:00.000Z';
const MIN = 60_000;

interface ReminderBody {
  id: string;
  status: string;
  attempts: number;
  sentAt: string | null;
  skipReason: string | null;
}
interface AppointmentBody {
  id: string;
  reminders: ReminderBody[];
}

async function newAppointment(phone: string) {
  const clinic = await request(app).post('/clinics').send({ name: 'Clínica Sol', timezone: 'Europe/Madrid' });
  const clinicId = (clinic.body as { id: string }).id;
  const patient = await request(app).post('/patients').send({ clinicId, name: 'Ana', phone, acceptsReminders: true });
  const patientId = (patient.body as { id: string }).id;
  const created = await request(app).post('/appointments').send({ clinicId, patientId, startsAt: STARTS_AT });
  expect(created.status).toBe(201);
  const body = created.body as AppointmentBody;
  return { appointmentId: body.id, reminderId: body.reminders[0]!.id };
}

async function reminderOf(appointmentId: string): Promise<ReminderBody> {
  const res = await request(app).get(`/appointments/${appointmentId}`);
  return (res.body as AppointmentBody).reminders[0]!;
}

const runPass = () => request(app).post('/jobs/reminders/run');
const setClock = (iso: string) => clock.set(new Date(iso));
const plus = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

async function providerGet<T>(path: string): Promise<T> {
  return (await (await fetch(`${providerUrl}${path}`)).json()) as T;
}
const messagesTo = (to: string) => providerGet<{ text: string; idempotencyKey: string }[]>(`/admin/messages?to=${encodeURIComponent(to)}`);
const requestsTo = (to: string) => providerGet<{ idempotencyKey: string; status: number }[]>(`/admin/requests?to=${encodeURIComponent(to)}`);

async function providerRule(to: string, mode: string, count = 1): Promise<void> {
  const res = await fetch(`${providerUrl}/admin/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, mode, count }),
  });
  expect(res.status).toBe(204);
}

async function nextAttemptAt(): Promise<string> {
  const rows = await sql<{ next_attempt_at: Date }>`SELECT next_attempt_at FROM reminders`.execute(db);
  return rows.rows[0]!.next_attempt_at.toISOString();
}

beforeAll(async () => {
  await migrate(pool);
});

beforeEach(async () => {
  await sql`TRUNCATE inbound_messages, reminders, appointments, patients, clinics RESTART IDENTITY CASCADE`.execute(db);
  await fetch(`${providerUrl}/admin/reset`, { method: 'POST' });
  setClock(CREATED_AT);
});

afterAll(async () => {
  await pool.end();
});

// El timeout de 5 s sin respuesta lo cubre test/integration/http-message-provider.test.ts (T10).
describe('reintentos y fallos del proveedor', () => {
  it('un 503 deja el recordatorio pending a +1 min; a la misma hora y a +59,999 s no se reintenta', async () => {
    const { appointmentId } = await newAppointment('+34600001001');
    await providerRule('+34600001001', 'unavailable');
    setClock(SEND_TIME);

    expect((await runPass()).body).toEqual({ processed: 1 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'pending', attempts: 1 });
    expect(await nextAttemptAt()).toBe(plus(SEND_TIME, MIN));
    expect(await requestsTo('+34600001001')).toHaveLength(1);

    expect((await runPass()).body).toEqual({ processed: 0 });
    setClock(plus(SEND_TIME, MIN - 1));
    expect((await runPass()).body).toEqual({ processed: 0 });
    expect(await requestsTo('+34600001001')).toHaveLength(1);
  });

  it('al avanzar 1 min se reintenta y, si el proveedor ya responde, queda sent con attempts 2', async () => {
    const { appointmentId } = await newAppointment('+34600001002');
    await providerRule('+34600001002', 'unavailable');
    setClock(SEND_TIME);
    await runPass();

    setClock(plus(SEND_TIME, MIN));
    expect((await runPass()).body).toEqual({ processed: 1 });

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'sent', attempts: 2, sentAt: plus(SEND_TIME, MIN) });
    expect(await requestsTo('+34600001002')).toHaveLength(2);
    expect(await messagesTo('+34600001002')).toHaveLength(1);
  });

  it('tras el segundo fallo el reintento espera 5 min desde ese segundo fallo', async () => {
    const { appointmentId } = await newAppointment('+34600001003');
    await providerRule('+34600001003', 'unavailable', 2);
    setClock(SEND_TIME);
    await runPass();
    const secondFailure = plus(SEND_TIME, MIN + 30_000);
    setClock(secondFailure);
    await runPass();

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'pending', attempts: 2 });
    expect(await nextAttemptAt()).toBe(plus(secondFailure, 5 * MIN));

    setClock(plus(secondFailure, 5 * MIN - 1));
    expect((await runPass()).body).toEqual({ processed: 0 });
    setClock(plus(secondFailure, 5 * MIN));
    expect((await runPass()).body).toEqual({ processed: 1 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'sent', attempts: 3 });
  });

  it('si el tercer intento falla el recordatorio queda failed con attempts 3 y exactamente 3 peticiones', async () => {
    const { appointmentId } = await newAppointment('+34600001004');
    await providerRule('+34600001004', 'unavailable', 3);
    setClock(SEND_TIME);
    await runPass();
    setClock(plus(SEND_TIME, MIN));
    await runPass();
    setClock(plus(SEND_TIME, 6 * MIN));
    await runPass();

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'failed', attempts: 3, sentAt: null });
    expect(await requestsTo('+34600001004')).toHaveLength(3);

    setClock(plus(SEND_TIME, 60 * MIN));
    expect((await runPass()).body).toEqual({ processed: 0 });
    expect(await requestsTo('+34600001004')).toHaveLength(3);
    expect(await messagesTo('+34600001004')).toEqual([]);
  });

  it('un 504 con la respuesta perdida se reintenta con la misma Idempotency-Key, recibe 200 duplicate y deja un solo mensaje', async () => {
    const { appointmentId, reminderId } = await newAppointment('+34600001005');
    await providerRule('+34600001005', 'lost-response');
    setClock(SEND_TIME);
    await runPass();
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'pending', attempts: 1 });

    setClock(plus(SEND_TIME, MIN));
    await runPass();

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'sent', attempts: 2 });
    const requests = await requestsTo('+34600001005');
    expect(requests.map((r) => r.status)).toEqual([504, 200]);
    expect(requests.map((r) => r.idempotencyKey)).toEqual([reminderId, reminderId]);
    expect(await messagesTo('+34600001005')).toHaveLength(1);
  });

  it('un 422 deja el recordatorio failed sin reintentos', async () => {
    const { appointmentId } = await newAppointment('+34600001006');
    await providerRule('+34600001006', 'reject');
    setClock(SEND_TIME);
    await runPass();

    setClock(plus(SEND_TIME, 10 * MIN));
    expect((await runPass()).body).toEqual({ processed: 0 });

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'failed', attempts: 1 });
    expect(await requestsTo('+34600001006')).toHaveLength(1);
  });

  it('un reintento dentro de la franja silenciosa se envía sin esperar a las 09:00', async () => {
    const { appointmentId } = await newAppointment('+34600001007');
    await providerRule('+34600001007', 'unavailable');
    // Fallo a las 20:59:30 en Madrid (CEST, UTC+2); el reintento cae a las 21:00:30, ya en la franja silenciosa.
    setClock('2027-06-16T18:59:30.000Z');
    await runPass();
    expect(await nextAttemptAt()).toBe('2027-06-16T19:00:30.000Z');

    setClock('2027-06-16T19:00:30.000Z');
    await runPass();

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'sent', attempts: 2, sentAt: '2027-06-16T19:00:30.000Z' });
  });

  it('si la cita ya empezó al llegar el reintento queda skipped/too_late sin llamar al proveedor', async () => {
    const { appointmentId } = await newAppointment('+34600001008');
    await providerRule('+34600001008', 'unavailable');
    setClock('2027-06-17T07:59:30.000Z');
    await runPass();
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'pending', attempts: 1 });

    setClock('2027-06-17T08:00:30.000Z');
    expect((await runPass()).body).toEqual({ processed: 1 });

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'skipped', skipReason: 'too_late', attempts: 1 });
    expect(await requestsTo('+34600001008')).toHaveLength(1);
  });
});
