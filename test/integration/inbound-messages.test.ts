import { TEST_DATABASE_URL } from '../support/database-url.js';
import { randomInt, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCancelAppointment } from '../../src/application/cancel-appointment.js';
import { makeCreateAppointment } from '../../src/application/create-appointment.js';
import { makeCreateClinic } from '../../src/application/create-clinic.js';
import { makeCreatePatient } from '../../src/application/create-patient.js';
import { makeGetAppointment } from '../../src/application/get-appointment.js';
import { makeHandleInboundMessage } from '../../src/application/handle-inbound-message.js';
import { makeRescheduleAppointment } from '../../src/application/reschedule-appointment.js';
import { createApp } from '../../src/http/app.js';
import { TestClock } from '../../src/infrastructure/clock/test-clock.js';
import { createDb } from '../../src/infrastructure/db/database.js';
import { KyselyAppointmentRepository } from '../../src/infrastructure/db/kysely-appointment-repository.js';
import { KyselyClinicRepository } from '../../src/infrastructure/db/kysely-clinic-repository.js';
import { KyselyPatientRepository } from '../../src/infrastructure/db/kysely-patient-repository.js';
import { KyselyUnitOfWork } from '../../src/infrastructure/db/kysely-unit-of-work.js';
import { migrate } from '../../src/infrastructure/db/migrator.js';

const databaseUrl = TEST_DATABASE_URL;
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
    handleInboundMessage: makeHandleInboundMessage({ unitOfWork, clock }),
  },
});

const idOf = (res: request.Response): string => (res.body as { id: string }).id;
const STARTS_AT = '2027-03-28T10:00:00.000Z';
const RECEIVED_AT = '2027-03-10T12:00:00Z';

let clinicId: string;

beforeAll(async () => {
  await migrate(pool);
  clinicId = idOf(await request(app).post('/clinics').send({ name: 'Clínica T13', timezone: 'Europe/Madrid' }));
});

beforeEach(() => {
  clock.set(new Date('2027-03-01T00:00:00.000Z'));
});

afterAll(async () => {
  await pool.end();
});

const newPhone = (): string => `+346${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;

async function newPatient(phone: string): Promise<string> {
  return idOf(await request(app).post('/patients').send({ clinicId, name: 'Ana', phone, acceptsReminders: true }));
}

interface AppointmentBody {
  id: string;
  status: string;
  reminders: { id: string; status: string }[];
}

async function newAppointment(patientId: string): Promise<AppointmentBody> {
  const res = await request(app).post('/appointments').send({ clinicId, patientId, startsAt: STARTS_AT });
  return res.body as AppointmentBody;
}

async function getAppointment(id: string): Promise<AppointmentBody> {
  return (await request(app).get(`/appointments/${id}`)).body as AppointmentBody;
}

/** Marca el recordatorio como enviado sin pasar por el proveedor. */
async function markSent(reminderId: string, sentAt: string, sentSeq?: number): Promise<void> {
  await pool.query(
    `UPDATE reminders SET status = 'sent', sent_at = $2, sent_seq = COALESCE($3::bigint, nextval('reminder_sent_seq')) WHERE id = $1`,
    [reminderId, sentAt, sentSeq ?? null],
  );
}

/** Cita con su recordatorio ya enviado al teléfono dado. */
async function sentAppointment(phone: string, sentAt = '2027-03-27T09:00:00Z', sentSeq?: number): Promise<AppointmentBody> {
  const appointment = await newAppointment(await newPatient(phone));
  await markSent(appointment.reminders[0]!.id, sentAt, sentSeq);
  return appointment;
}

const inbound = (body: Record<string, unknown>) => request(app).post('/webhooks/inbound-messages').send(body);
const reply = (from: string, text: string, messageId: string = randomUUID()) =>
  inbound({ messageId, from, text, receivedAt: RECEIVED_AT });

async function outcomeOf(messageId: string): Promise<string[]> {
  const { rows } = await pool.query<{ outcome: string }>('SELECT outcome FROM inbound_messages WHERE message_id = $1', [messageId]);
  return rows.map((row) => row.outcome);
}

describe('POST /webhooks/inbound-messages: validación', () => {
  const valid = { messageId: 'm', from: '+34600000000', text: 'SI', receivedAt: RECEIVED_AT };

  it.each([
    ['sin messageId', { from: valid.from, text: 'SI', receivedAt: RECEIVED_AT }],
    ['messageId vacío', { ...valid, messageId: '' }],
    ['sin from', { messageId: 'm', text: 'SI', receivedAt: RECEIVED_AT }],
    ['text no string', { ...valid, text: 5 }],
    ['sin text', { messageId: 'm', from: valid.from, receivedAt: RECEIVED_AT }],
    ['receivedAt sin zona', { ...valid, receivedAt: '2027-03-10T12:00:00' }],
    ['sin receivedAt', { messageId: 'm', from: valid.from, text: 'SI' }],
  ])('400 %s', async (_name, body) => {
    const res = await inbound(body);

    expect(res.status).toBe(400);
  });

  it('un cuerpo inválido no registra el messageId', async () => {
    const messageId = randomUUID();
    await inbound({ messageId, from: '+34600000000', text: 5, receivedAt: RECEIVED_AT });

    expect(await outcomeOf(messageId)).toEqual([]);
  });

  it('200 aunque no haya cita destino (teléfono desconocido) y se registra como ignored', async () => {
    const messageId = randomUUID();

    const res = await reply(newPhone(), 'SI', messageId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(await outcomeOf(messageId)).toEqual(['ignored']);
  });
});

describe('POST /webhooks/inbound-messages: efectos', () => {
  it.each(['SI', 'Sí', 'si.', '  SÍ!'])('%j confirma la cita', async (text) => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    const messageId = randomUUID();

    const res = await reply(phone, text, messageId);

    expect(res.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('confirmed');
    expect(await outcomeOf(messageId)).toEqual(['confirmed']);
  });

  it.each(['NO', 'no', 'No!'])('%j cancela la cita', async (text) => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    const messageId = randomUUID();

    const res = await reply(phone, text, messageId);

    expect(res.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('cancelled');
    expect(await outcomeOf(messageId)).toEqual(['cancelled']);
  });

  it('NO cancela también el recordatorio pending de una cita reprogramada y conserva el sent', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    await request(app).patch(`/appointments/${appointment.id}`).send({ startsAt: '2027-03-29T10:00:00Z' });
    const before = await getAppointment(appointment.id);
    expect(before.reminders.map((r) => r.status)).toEqual(['sent', 'pending']);

    await reply(phone, 'NO');

    const after = await getAppointment(appointment.id);
    expect(after.status).toBe('cancelled');
    expect(after.reminders.map((r) => r.status)).toEqual(['sent', 'cancelled']);
  });

  it.each(['sí gracias', 'vale', '', 'S I'])('el texto %j se ignora y no cambia nada', async (text) => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    const messageId = randomUUID();

    const res = await reply(phone, text, messageId);

    expect(res.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
    expect(await outcomeOf(messageId)).toEqual(['ignored']);
  });

  it('SI sobre una cita ya confirmed la deja confirmed', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    await reply(phone, 'SI');

    const res = await reply(phone, 'SI');

    expect(res.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('confirmed');
  });

  it('NO sobre una cita confirmed la cancela (las confirmed también son destino)', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    await reply(phone, 'SI');

    await reply(phone, 'NO');

    expect((await getAppointment(appointment.id)).status).toBe('cancelled');
  });

  it('una cita con el recordatorio todavía pending no es destino', async () => {
    const phone = newPhone();
    const appointment = await newAppointment(await newPatient(phone));

    await reply(phone, 'SI');

    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
  });
});

describe('POST /webhooks/inbound-messages: cita destino', () => {
  it('una cita empezada según la hora del servicio no es destino (aunque la hora real sea anterior)', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    clock.set(new Date('2027-03-28T10:30:00.000Z'));
    const messageId = randomUUID();

    const res = await reply(phone, 'NO', messageId);

    expect(res.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
    expect(await outcomeOf(messageId)).toEqual(['ignored']);
  });

  it('una cita que empieza justo ahora ya ha empezado', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    clock.set(new Date(STARTS_AT));

    await reply(phone, 'SI');

    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
  });

  it('una cita cancelada no es destino', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    await request(app).post(`/appointments/${appointment.id}/cancel`);
    const messageId = randomUUID();

    const res = await reply(phone, 'SI', messageId);

    expect(res.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('cancelled');
    expect(await outcomeOf(messageId)).toEqual(['ignored']);
  });

  it('con varios pacientes con el mismo teléfono, gana el recordatorio con mayor sent_at (aunque tenga menor sent_seq)', async () => {
    const phone = newPhone();
    const older = await sentAppointment(phone, '2027-03-27T09:00:00Z', 900_000_000);
    const newer = await sentAppointment(phone, '2027-03-27T09:05:00Z', 100);

    await reply(phone, 'SI');

    expect((await getAppointment(newer.id)).status).toBe('confirmed');
    expect((await getAppointment(older.id)).status).toBe('scheduled');
  });

  it('a igualdad de sent_at gana el mayor sent_seq', async () => {
    const phone = newPhone();
    const higherSeq = await sentAppointment(phone, '2027-03-27T09:00:00Z', 900_000_100);
    const lowerSeq = await sentAppointment(phone, '2027-03-27T09:00:00Z', 900_000_050);

    await reply(phone, 'SI');

    expect((await getAppointment(higherSeq.id)).status).toBe('confirmed');
    expect((await getAppointment(lowerSeq.id)).status).toBe('scheduled');
  });

  it('si el más reciente está cancelado, se aplica a la siguiente cita elegible', async () => {
    const phone = newPhone();
    const eligible = await sentAppointment(phone, '2027-03-27T09:00:00Z');
    const cancelled = await sentAppointment(phone, '2027-03-27T09:05:00Z');
    await request(app).post(`/appointments/${cancelled.id}/cancel`);

    await reply(phone, 'SI');

    expect((await getAppointment(eligible.id)).status).toBe('confirmed');
  });
});

describe('POST /webhooks/inbound-messages: idempotencia por messageId', () => {
  it('un messageId repetido no se reprocesa aunque la primera vez se ignorara', async () => {
    const phone = newPhone();
    const messageId = randomUUID();
    await reply(phone, 'NO', messageId);
    const appointment = await sentAppointment(phone);

    const res = await reply(phone, 'NO', messageId);

    expect(res.status).toBe(200);
    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
    expect(await outcomeOf(messageId)).toEqual(['ignored']);
  });

  it('un messageId repetido tras un efecto no vuelve a aplicarse', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    const messageId = randomUUID();
    await reply(phone, 'SI', messageId);
    await request(app).patch(`/appointments/${appointment.id}`).send({ startsAt: '2027-03-29T10:00:00Z' });
    expect((await getAppointment(appointment.id)).status).toBe('scheduled');

    await reply(phone, 'SI', messageId);

    expect((await getAppointment(appointment.id)).status).toBe('scheduled');
    expect(await outcomeOf(messageId)).toEqual(['confirmed']);
  });

  it('dos avisos concurrentes con el mismo messageId producen un único efecto', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    const messageId = randomUUID();

    const results = await Promise.all([reply(phone, 'NO', messageId), reply(phone, 'NO', messageId)]);

    expect(results.map((res) => res.status)).toEqual([200, 200]);
    expect(await outcomeOf(messageId)).toEqual(['cancelled']);
    expect((await getAppointment(appointment.id)).status).toBe('cancelled');
  });

  it('dos avisos concurrentes con el mismo messageId y distinto texto dejan un solo outcome coherente con la cita', async () => {
    const phone = newPhone();
    const appointment = await sentAppointment(phone);
    const messageId = randomUUID();

    await Promise.all([reply(phone, 'SI', messageId), reply(phone, 'NO', messageId)]);

    const outcomes = await outcomeOf(messageId);
    expect(outcomes).toHaveLength(1);
    const status = (await getAppointment(appointment.id)).status;
    expect(status).toBe(outcomes[0] === 'confirmed' ? 'confirmed' : 'cancelled');
  });
});
