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

interface Scenario {
  phone?: string | null;
  acceptsReminders?: boolean;
  startsAt?: string;
}

async function newAppointment({ phone = '+34600000001', acceptsReminders = true, startsAt = STARTS_AT }: Scenario = {}) {
  const clinic = await request(app).post('/clinics').send({ name: 'Clínica Sol', timezone: 'Europe/Madrid' });
  const clinicId = (clinic.body as { id: string }).id;
  const patient = await request(app).post('/patients').send({ clinicId, name: 'Ana', phone, acceptsReminders });
  const patientId = (patient.body as { id: string }).id;
  const created = await request(app).post('/appointments').send({ clinicId, patientId, startsAt });
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

async function providerGet<T>(path: string): Promise<T> {
  return (await (await fetch(`${providerUrl}${path}`)).json()) as T;
}
const messagesTo = (to: string) => providerGet<{ text: string; idempotencyKey: string }[]>(`/admin/messages?to=${encodeURIComponent(to)}`);
const requestsTo = (to: string) => providerGet<{ idempotencyKey: string; text: string; status: number }[]>(`/admin/requests?to=${encodeURIComponent(to)}`);

async function providerRule(to: string, mode: string, count = 1): Promise<void> {
  const res = await fetch(`${providerUrl}/admin/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, mode, count }),
  });
  expect(res.status).toBe(204);
}

beforeAll(async () => {
  await migrate(pool);
});

beforeEach(async () => {
  // La pasada trata todos los vencidos de la base: cada test parte de una base y un proveedor limpios.
  await sql`TRUNCATE inbound_messages, reminders, appointments, patients, clinics RESTART IDENTITY CASCADE`.execute(db);
  await fetch(`${providerUrl}/admin/reset`, { method: 'POST' });
  setClock(CREATED_AT);
});

afterAll(async () => {
  await pool.end();
});

describe('POST /jobs/reminders/run', () => {
  it('envía el texto exacto con fecha y hora locales de la clínica y deja el recordatorio sent', async () => {
    const { appointmentId, reminderId } = await newAppointment({ phone: '+34600000101' });
    setClock(SEND_TIME);

    const res = await runPass();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ processed: 1 });
    expect(await messagesTo('+34600000101')).toEqual([
      expect.objectContaining({
        text: 'Hola Ana, te recordamos tu cita en Clínica Sol el 17/06/2027 a las 10:00. Responde SI para confirmar o NO para cancelar.',
      }),
    ]);
    expect(await reminderOf(appointmentId)).toEqual({
      id: reminderId,
      scheduledFor: SEND_TIME,
      status: 'sent',
      attempts: 1,
      sentAt: SEND_TIME,
      skipReason: null,
    });
  });

  it('llama al proveedor con Idempotency-Key igual al id del recordatorio', async () => {
    const { reminderId } = await newAppointment({ phone: '+34600000102' });
    setClock(SEND_TIME);

    await runPass();

    const requests = await requestsTo('+34600000102');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ idempotencyKey: reminderId, status: 202 });
  });

  it('sentAt es la hora del servicio aunque la pasada se haga tarde, y sent_seq crece de forma monotónica', async () => {
    const first = await newAppointment({ phone: '+34600000103' });
    const second = await newAppointment({ phone: '+34600000104' });
    setClock('2027-06-16T08:30:00.000Z');

    await runPass();

    expect((await reminderOf(first.appointmentId)).sentAt).toBe('2027-06-16T08:30:00.000Z');
    const rows = await sql<{ id: string; sent_seq: string }>`SELECT id, sent_seq FROM reminders ORDER BY sent_seq`.execute(db);
    expect(rows.rows).toHaveLength(2);
    const seqs = rows.rows.map((r) => Number(r.sent_seq));
    expect(seqs[1]! - seqs[0]!).toBe(1);
    expect(rows.rows.map((r) => r.id).sort()).toEqual([first.reminderId, second.reminderId].sort());

    await newAppointment({ phone: '+34600000105' });
    setClock('2027-06-16T09:00:00.000Z');
    await runPass();
    const third = await sql<{ sent_seq: string }>`SELECT max(sent_seq) AS sent_seq FROM reminders`.execute(db);
    expect(Number(third.rows[0]!.sent_seq)).toBeGreaterThan(seqs[1]!);
  });

  it('descarta no_phone sin llamar al proveedor y con attempts 0', async () => {
    const { appointmentId } = await newAppointment({ phone: null });
    setClock(SEND_TIME);

    const res = await runPass();

    expect(res.body).toEqual({ processed: 1 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'skipped', skipReason: 'no_phone', attempts: 0, sentAt: null });
    expect(await providerGet<unknown[]>('/admin/requests')).toEqual([]);
  });

  it('descarta opted_out sin llamar al proveedor y con attempts 0', async () => {
    const { appointmentId } = await newAppointment({ phone: '+34600000106', acceptsReminders: false });
    setClock(SEND_TIME);

    await runPass();

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'skipped', skipReason: 'opted_out', attempts: 0 });
    expect(await requestsTo('+34600000106')).toEqual([]);
  });

  it('sin teléfono y sin aceptar recordatorios gana no_phone', async () => {
    const { appointmentId } = await newAppointment({ phone: null, acceptsReminders: false });
    setClock(SEND_TIME);

    await runPass();

    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'skipped', skipReason: 'no_phone', attempts: 0 });
    expect(await providerGet<unknown[]>('/admin/requests')).toEqual([]);
  });

  it('descarta too_late sin llamar al proveedor si la cita ya empezó', async () => {
    const { appointmentId } = await newAppointment({ phone: '+34600000107' });
    setClock('2027-06-17T08:30:00.000Z');

    const res = await runPass();

    expect(res.body).toEqual({ processed: 1 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'skipped', skipReason: 'too_late', attempts: 0 });
    expect(await requestsTo('+34600000107')).toEqual([]);
  });

  it('no toca los recordatorios cuya hora aún no ha llegado', async () => {
    const { appointmentId } = await newAppointment({ phone: '+34600000108' });
    setClock('2027-06-16T07:59:59.999Z');

    const res = await runPass();

    expect(res.body).toEqual({ processed: 0 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await requestsTo('+34600000108')).toEqual([]);
  });

  it('processed cuenta todos los reclamados, enviados y descartados; la siguiente pasada no encuentra trabajo', async () => {
    await newAppointment({ phone: '+34600000109' });
    await newAppointment({ phone: null });
    await newAppointment({ phone: '+34600000110', acceptsReminders: false });
    setClock(SEND_TIME);

    const first = await runPass();
    const second = await runPass();

    expect(first.body).toEqual({ processed: 3 });
    expect(second.body).toEqual({ processed: 0 });
  });

  it('una pasada sin recordatorios responde processed 0', async () => {
    expect((await runPass()).body).toEqual({ processed: 0 });
  });

  it('procesa más recordatorios que el tamaño del lote y de la concurrencia', async () => {
    for (let i = 0; i < 12; i++) await newAppointment({ phone: `+346000002${String(i).padStart(2, '0')}` });
    setClock(SEND_TIME);
    const smallBatches = makeRunReminders({
      queue: new KyselyReminderQueue(db),
      provider: new HttpMessageProvider(providerUrl),
      clock,
      batchSize: 5,
      concurrency: 2,
    });

    expect(await smallBatches()).toEqual({ processed: 12 });
    expect(await providerGet<unknown[]>('/admin/messages')).toHaveLength(12);
  });

  it('un recordatorio rechazado (422) queda failed con attempts 1', async () => {
    const { appointmentId } = await newAppointment({ phone: '+34600000111' });
    await providerRule('+34600000111', 'reject');
    setClock(SEND_TIME);

    const res = await runPass();

    expect(res.body).toEqual({ processed: 1 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'failed', attempts: 1, sentAt: null });
    expect(await messagesTo('+34600000111')).toEqual([]);
  });

  it('un fallo transitorio deja el recordatorio pending con un intento y la pasada termina (sin reintentar en bucle)', async () => {
    const { appointmentId } = await newAppointment({ phone: '+34600000112' });
    await providerRule('+34600000112', 'unavailable');
    setClock(SEND_TIME);

    const res = await runPass();

    expect(res.body).toEqual({ processed: 1 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'pending', attempts: 1 });
    expect(await requestsTo('+34600000112')).toHaveLength(1);
    const claim = await sql<{ claim_token: string | null }>`SELECT claim_token FROM reminders`.execute(db);
    expect(claim.rows[0]!.claim_token).toBeNull();
  });

  it('no procesa un recordatorio con el claim vigente de otra pasada', async () => {
    const { appointmentId } = await newAppointment({ phone: '+34600000113' });
    await sql`UPDATE reminders SET claim_token = ${randomUUID()}, claimed_until = now() + interval '60 seconds'`.execute(db);
    setClock(SEND_TIME);

    const res = await runPass();

    expect(res.body).toEqual({ processed: 0 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await requestsTo('+34600000113')).toEqual([]);
  });

  it('reclama un recordatorio cuyo claim ya caducó (lease según el reloj de la base)', async () => {
    const { appointmentId } = await newAppointment({ phone: '+34600000114' });
    await sql`UPDATE reminders SET claim_token = ${randomUUID()}, claimed_until = now() - interval '1 second'`.execute(db);
    setClock(SEND_TIME);

    const res = await runPass();

    expect(res.body).toEqual({ processed: 1 });
    expect(await reminderOf(appointmentId)).toMatchObject({ status: 'sent', attempts: 1 });
  });
});
