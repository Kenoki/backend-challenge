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
import type { DeliveryOutcome, MessageProvider, SendMessage } from '../../src/application/ports/message-provider.js';
import { makeRescheduleAppointment } from '../../src/application/reschedule-appointment.js';
import { makeRunReminders, type RunRemindersUseCase } from '../../src/application/run-reminders.js';
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
const queue = new KyselyReminderQueue(db);

function makeApp(runReminders: RunRemindersUseCase) {
  return createApp({
    useCases: {
      createClinic: makeCreateClinic({ clinics }),
      createPatient: makeCreatePatient({ clinics, patients }),
      createAppointment: makeCreateAppointment({ unitOfWork, clock }),
      getAppointment: makeGetAppointment({ appointments }),
      rescheduleAppointment: makeRescheduleAppointment({ unitOfWork, clock }),
      cancelAppointment: makeCancelAppointment({ unitOfWork }),
      runReminders,
    },
  });
}
type App = ReturnType<typeof makeApp>;

/** Proveedor falso cuya llamada se queda bloqueada hasta que el test la libera con el resultado que quiera. */
class GatedProvider implements MessageProvider {
  readonly calls: SendMessage[] = [];
  private readonly gates: ((outcome: DeliveryOutcome) => void)[] = [];
  private arrivals: (() => void)[] = [];

  send(message: SendMessage): Promise<DeliveryOutcome> {
    this.calls.push(message);
    const arrivals = this.arrivals;
    this.arrivals = [];
    arrivals.forEach((arrived) => arrived());
    return new Promise((resolve) => this.gates.push(resolve));
  }

  async waitForCalls(count: number): Promise<void> {
    while (this.calls.length < count) await new Promise<void>((arrived) => this.arrivals.push(arrived));
  }

  release(outcome: DeliveryOutcome, index = 0): void {
    this.gates[index]!(outcome);
  }
}

/** Proveedor falso que responde al instante, para la pasada que roba el claim. */
class InstantProvider implements MessageProvider {
  readonly calls: SendMessage[] = [];
  send(message: SendMessage): Promise<DeliveryOutcome> {
    this.calls.push(message);
    return Promise.resolve({ kind: 'delivered' });
  }
}

// Cita el 17/06/2027 a las 10:00 en Madrid: el recordatorio se programa el 16/06/2027 a las 10:00 (08:00Z).
const STARTS_AT = '2027-06-17T08:00:00.000Z';
const RESCHEDULED_AT = '2027-06-20T08:00:00.000Z';
const SEND_TIME = '2027-06-16T08:00:00.000Z';
const CREATED_AT = '2027-06-01T00:00:00.000Z';
const MIN = 60_000;

interface ReminderBody {
  id: string;
  status: string;
  attempts: number;
  sentAt: string | null;
}
interface AppointmentBody {
  id: string;
  reminders: ReminderBody[];
}

const setClock = (iso: string) => clock.set(new Date(iso));
const plus = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

async function seedClinic(app: App): Promise<string> {
  const clinic = await request(app).post('/clinics').send({ name: 'Clínica Sol', timezone: 'Europe/Madrid' });
  return (clinic.body as { id: string }).id;
}

async function seedAppointment(app: App, clinicId: string, phone: string) {
  const patient = await request(app).post('/patients').send({ clinicId, name: 'Ana', phone, acceptsReminders: true });
  const patientId = (patient.body as { id: string }).id;
  const created = await request(app).post('/appointments').send({ clinicId, patientId, startsAt: STARTS_AT });
  expect(created.status).toBe(201);
  const body = created.body as AppointmentBody;
  return { appointmentId: body.id, reminderId: body.reminders[0]!.id };
}

async function appointmentOf(app: App, id: string): Promise<AppointmentBody> {
  return (await request(app).get(`/appointments/${id}`)).body as AppointmentBody;
}

async function providerGet<T>(path: string): Promise<T> {
  return (await (await fetch(`${providerUrl}${path}`)).json()) as T;
}
const messagesTo = (to: string) => providerGet<unknown[]>(`/admin/messages?to=${encodeURIComponent(to)}`);
const requestsTo = (to: string) => providerGet<unknown[]>(`/admin/requests?to=${encodeURIComponent(to)}`);

interface ReminderRow {
  status: string;
  attempts: number;
  sent_at: Date | null;
  sent_seq: string | null;
  next_attempt_at: Date;
  claim_token: string | null;
}
async function reminderRow(id: string): Promise<ReminderRow> {
  const rows = await sql<ReminderRow>`SELECT status, attempts, sent_at, sent_seq, next_attempt_at, claim_token FROM reminders WHERE id = ${id}`.execute(db);
  return rows.rows[0]!;
}

/** Simula un claim vigente (o caducado) con el reloj de Postgres, igual que lo haría una pasada en vuelo. */
async function forceClaim(secondsFromNow: number): Promise<void> {
  await sql`UPDATE reminders SET claim_token = gen_random_uuid(), claimed_until = now() + make_interval(secs => ${secondsFromNow})`.execute(db);
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

describe('pasadas concurrentes', () => {
  it('5 pasadas en paralelo sobre 30 recordatorios vencidos envían cada uno una sola vez', async () => {
    // Lotes pequeños para que las pasadas se intercalen de verdad en vez de llevarse todo la primera.
    const run = makeRunReminders({ queue, provider: new HttpMessageProvider(providerUrl), clock, batchSize: 3, concurrency: 2 });
    const app = makeApp(run);
    const clinicId = await seedClinic(app);
    const phones = Array.from({ length: 30 }, (_, i) => `+346000${String(20000 + i)}`);
    for (const phone of phones) await seedAppointment(app, clinicId, phone);
    setClock(SEND_TIME);

    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).post('/jobs/reminders/run')));

    const processed = results.map((res) => (res.body as { processed: number }).processed);
    expect(processed.reduce((sum, n) => sum + n, 0)).toBe(30);
    for (const phone of phones) {
      expect(await requestsTo(phone)).toHaveLength(1);
      expect(await messagesTo(phone)).toHaveLength(1);
    }
    const states = await sql<{ status: string; n: string }>`SELECT status, count(*) AS n FROM reminders GROUP BY status`.execute(db);
    expect(states.rows).toEqual([{ status: 'sent', n: '30' }]);
  });
});

describe('lease con el reloj de Postgres', () => {
  it('mover el reloj del servicio días hacia delante o hacia atrás no libera un claim vigente', async () => {
    const provider = new InstantProvider();
    const app = makeApp(makeRunReminders({ queue, provider, clock }));
    const clinicId = await seedClinic(app);
    const { reminderId } = await seedAppointment(app, clinicId, '+34600003001');
    await sql`UPDATE reminders SET next_attempt_at = ${new Date('2027-06-02T00:00:00.000Z')}`.execute(db);
    setClock('2027-06-03T00:00:00.000Z');
    await forceClaim(60);

    setClock('2027-06-10T00:00:00.000Z');
    expect((await request(app).post('/jobs/reminders/run')).body).toEqual({ processed: 0 });
    setClock('2027-06-02T12:00:00.000Z');
    expect((await request(app).post('/jobs/reminders/run')).body).toEqual({ processed: 0 });

    expect(provider.calls).toHaveLength(0);
    expect((await reminderRow(reminderId)).status).toBe('pending');
  });

  it('un claim caducado según Postgres se reclama aunque el reloj del servicio esté muy por detrás', async () => {
    const provider = new InstantProvider();
    const app = makeApp(makeRunReminders({ queue, provider, clock }));
    const clinicId = await seedClinic(app);
    const { reminderId } = await seedAppointment(app, clinicId, '+34600003002');
    await sql`UPDATE reminders SET next_attempt_at = ${new Date('2027-06-02T00:00:00.000Z')}`.execute(db);
    setClock('2027-06-03T00:00:00.000Z');
    await forceClaim(-1);

    expect((await request(app).post('/jobs/reminders/run')).body).toEqual({ processed: 1 });

    expect(provider.calls).toHaveLength(1);
    expect((await reminderRow(reminderId)).status).toBe('sent');
  });

  it('claimed_until se fija con el now() de Postgres, no con la hora del servicio', async () => {
    const provider = new GatedProvider();
    const run = makeRunReminders({ queue, provider, clock });
    const app = makeApp(run);
    const clinicId = await seedClinic(app);
    const { reminderId } = await seedAppointment(app, clinicId, '+34600003003');
    setClock(SEND_TIME);

    const pass = run();
    await provider.waitForCalls(1);

    const lease = await sql<{ seconds: number }>`SELECT extract(epoch FROM claimed_until - now())::float AS seconds FROM reminders WHERE id = ${reminderId}`.execute(db);
    expect(lease.rows[0]!.seconds).toBeGreaterThan(0);
    expect(lease.rows[0]!.seconds).toBeLessThanOrEqual(60);

    provider.release({ kind: 'delivered' });
    await pass;
  });
});

describe('pérdida del claim', () => {
  async function stolenClaim() {
    const gated = new GatedProvider();
    const instant = new InstantProvider();
    const runFirst = makeRunReminders({ queue, provider: gated, clock });
    const runSecond = makeRunReminders({ queue, provider: instant, clock });
    const app = makeApp(runFirst);
    const clinicId = await seedClinic(app);
    const { reminderId } = await seedAppointment(app, clinicId, '+34600004001');
    setClock(SEND_TIME);

    const first = runFirst();
    await gated.waitForCalls(1);
    await sql`UPDATE reminders SET claimed_until = now() - interval '1 second'`.execute(db);
    expect(await runSecond()).toEqual({ processed: 1 });
    expect(instant.calls).toHaveLength(1);
    return { gated, first, reminderId };
  }

  it('si la primera pasada falla tras perder el claim, no reprograma ni suelta lo que guardó la segunda', async () => {
    const { gated, first, reminderId } = await stolenClaim();
    setClock(plus(SEND_TIME, 5 * MIN));

    gated.release({ kind: 'retryable' });
    await first;

    const row = await reminderRow(reminderId);
    expect(row).toMatchObject({ status: 'sent', attempts: 2 });
    expect(row.sent_at?.toISOString()).toBe(SEND_TIME);
    expect(row.next_attempt_at.toISOString()).toBe(SEND_TIME);
  });

  it('si la primera pasada entrega tras perder el claim, no sobrescribe sent_at ni sent_seq', async () => {
    const { gated, first, reminderId } = await stolenClaim();
    const stored = await reminderRow(reminderId);
    setClock(plus(SEND_TIME, 5 * MIN));

    gated.release({ kind: 'delivered' });
    await first;

    const row = await reminderRow(reminderId);
    expect(row).toMatchObject({ status: 'sent', attempts: 2, sent_seq: stored.sent_seq });
    expect(row.sent_at?.toISOString()).toBe(SEND_TIME);
  });
});

describe('envíos en vuelo y cambios de la cita', () => {
  async function inFlight(phone: string) {
    const provider = new GatedProvider();
    const run = makeRunReminders({ queue, provider, clock });
    const app = makeApp(run);
    const clinicId = await seedClinic(app);
    const { appointmentId, reminderId } = await seedAppointment(app, clinicId, phone);
    setClock(SEND_TIME);
    const pass = run();
    await provider.waitForCalls(1);
    return { provider, run, app, pass, appointmentId, reminderId };
  }

  it('si el envío en vuelo falla tras cancelar la cita, queda cancelled y no se reintenta', async () => {
    const { provider, run, app, pass, appointmentId, reminderId } = await inFlight('+34600005001');

    expect((await request(app).post(`/appointments/${appointmentId}/cancel`)).status).toBe(200);
    expect((await reminderRow(reminderId)).status).toBe('pending');
    provider.release({ kind: 'retryable' });
    expect(await pass).toEqual({ processed: 1 });

    expect(await reminderRow(reminderId)).toMatchObject({ status: 'cancelled', attempts: 1, claim_token: null });
    setClock(plus(SEND_TIME, 10 * MIN));
    expect(await run()).toEqual({ processed: 0 });
    expect(provider.calls).toHaveLength(1);
  });

  it('si el envío en vuelo es rechazado tras cancelar la cita, también queda cancelled', async () => {
    const { provider, app, pass, appointmentId, reminderId } = await inFlight('+34600005002');
    await request(app).post(`/appointments/${appointmentId}/cancel`);

    provider.release({ kind: 'rejected' });
    await pass;

    expect((await reminderRow(reminderId)).status).toBe('cancelled');
  });

  it('si el envío en vuelo falla tras reprogramar, el viejo queda cancelled y el nuevo pending sin reintentar la hora vieja', async () => {
    const { provider, run, app, pass, appointmentId, reminderId } = await inFlight('+34600005003');

    const rescheduled = await request(app).patch(`/appointments/${appointmentId}`).send({ startsAt: RESCHEDULED_AT });
    expect(rescheduled.status).toBe(200);
    provider.release({ kind: 'retryable' });
    await pass;

    const body = await appointmentOf(app, appointmentId);
    expect(body.reminders).toHaveLength(2);
    expect(body.reminders[0]).toMatchObject({ id: reminderId, status: 'cancelled' });
    expect(body.reminders[1]).toMatchObject({ status: 'pending', attempts: 0 });
    setClock(plus(SEND_TIME, 10 * MIN));
    expect(await run()).toEqual({ processed: 0 });
    expect(provider.calls).toHaveLength(1);
  });

  it('si el envío en vuelo tiene éxito tras cancelar la cita, queda sent', async () => {
    const { provider, app, pass, appointmentId, reminderId } = await inFlight('+34600005004');
    await request(app).post(`/appointments/${appointmentId}/cancel`);

    provider.release({ kind: 'delivered' });
    await pass;

    expect(await reminderRow(reminderId)).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('si el envío en vuelo tiene éxito tras reprogramar, el viejo queda sent y el nuevo pending', async () => {
    const { provider, app, pass, appointmentId, reminderId } = await inFlight('+34600005005');
    await request(app).patch(`/appointments/${appointmentId}`).send({ startsAt: RESCHEDULED_AT });

    provider.release({ kind: 'delivered' });
    await pass;

    const body = await appointmentOf(app, appointmentId);
    expect(body.reminders.map((r) => [r.id === reminderId, r.status])).toEqual([
      [true, 'sent'],
      [false, 'pending'],
    ]);
  });
});

describe('reclamar un reintento de una cita que ya no es vigente', () => {
  async function pendingRetry(phone: string) {
    const provider = new InstantProvider();
    const run = makeRunReminders({ queue, provider, clock });
    const app = makeApp(run);
    const clinicId = await seedClinic(app);
    const { reminderId } = await seedAppointment(app, clinicId, phone);
    await sql`UPDATE reminders SET attempts = 1`.execute(db);
    setClock(SEND_TIME);
    return { provider, run, reminderId };
  }

  it('con la cita cancelada pasa a cancelled sin llamar al proveedor', async () => {
    const { provider, run, reminderId } = await pendingRetry('+34600006001');
    await sql`UPDATE appointments SET status = 'cancelled'`.execute(db);

    expect(await run()).toEqual({ processed: 1 });

    expect(await reminderRow(reminderId)).toMatchObject({ status: 'cancelled', attempts: 1, claim_token: null });
    expect(provider.calls).toHaveLength(0);
  });

  it('con la cita reprogramada pasa a cancelled sin llamar al proveedor', async () => {
    const { provider, run, reminderId } = await pendingRetry('+34600006002');
    await sql`UPDATE appointments SET starts_at = starts_at + interval '3 days'`.execute(db);

    expect(await run()).toEqual({ processed: 1 });

    expect((await reminderRow(reminderId)).status).toBe('cancelled');
    expect(provider.calls).toHaveLength(0);
  });
});
