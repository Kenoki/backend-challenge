import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeCreateClinic } from '../../src/application/create-clinic.js';
import { makeCreatePatient } from '../../src/application/create-patient.js';
import { createApp } from '../../src/http/app.js';
import { createDb } from '../../src/infrastructure/db/database.js';
import { KyselyClinicRepository } from '../../src/infrastructure/db/kysely-clinic-repository.js';
import { KyselyPatientRepository } from '../../src/infrastructure/db/kysely-patient-repository.js';
import { migrate } from '../../src/infrastructure/db/migrator.js';

const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const pool = new Pool({ connectionString: databaseUrl });
const db = createDb(pool);
const clinics = new KyselyClinicRepository(db);
const patients = new KyselyPatientRepository(db);
const app = createApp({
  useCases: {
    createClinic: makeCreateClinic({ clinics }),
    createPatient: makeCreatePatient({ clinics, patients }),
  },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (res: request.Response): unknown => res.body;
const idOf = (res: request.Response): string => (res.body as { id: string }).id;

const anyString = expect.any(String) as string;
const anyUuid = expect.stringMatching(UUID) as string;

let clinicId: string;

beforeAll(async () => {
  await migrate(pool);
  const res = await request(app)
    .post('/clinics')
    .send({ name: `Clínica ${randomUUID()}`, timezone: 'Europe/Madrid' });
  clinicId = idOf(res);
});

afterAll(async () => {
  await pool.end();
});

describe('POST /patients', () => {
  it('crea un paciente con teléfono', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId, name: 'Ana', phone: '+34600111222', acceptsReminders: true });

    expect(res.status).toBe(201);
    expect(json(res)).toEqual({
      id: anyUuid,
      clinicId,
      name: 'Ana',
      phone: '+34600111222',
      acceptsReminders: true,
    });
  });

  it('crea un paciente con phone null', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId, name: 'Luis', phone: null, acceptsReminders: true });

    expect(res.status).toBe(201);
    expect(json(res)).toEqual({ id: anyUuid, clinicId, name: 'Luis', phone: null, acceptsReminders: true });
  });

  it('guarda phone null cuando se omite', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId, name: 'Sin teléfono', acceptsReminders: true });

    expect(res.status).toBe(201);
    expect(json(res)).toEqual({
      id: anyUuid,
      clinicId,
      name: 'Sin teléfono',
      phone: null,
      acceptsReminders: true,
    });
    const { rows } = await pool.query('SELECT phone FROM patients WHERE id = $1', [idOf(res)]);
    expect(rows).toEqual([{ phone: null }]);
  });

  it('admite acceptsReminders false', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId, name: 'Pau', phone: '+34600111222', acceptsReminders: false });

    expect(res.status).toBe(201);
    expect((res.body as { acceptsReminders: boolean }).acceptsReminders).toBe(false);
  });

  it('persiste el paciente creado', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId, name: 'Persistido', phone: '+34600111222', acceptsReminders: false });

    const stored = await patients.findById(idOf(res));

    expect(stored?.clinicId).toBe(clinicId);
    expect(stored?.name).toBe('Persistido');
    expect(stored?.phone?.value).toBe('+34600111222');
    expect(stored?.acceptsReminders).toBe(false);
    const { rows } = await pool.query(
      'SELECT clinic_id, name, phone, accepts_reminders FROM patients WHERE id = $1',
      [idOf(res)],
    );
    expect(rows).toEqual([
      { clinic_id: clinicId, name: 'Persistido', phone: '+34600111222', accepts_reminders: false },
    ]);
  });

  it('findById devuelve null con un id que no es UUID', async () => {
    expect(await patients.findById('abc')).toBeNull();
  });

  it.each([
    ['sin prefijo +', '600111222'],
    ['con +00', '+0034600111222'],
    ['demasiado corto', '+34'],
    ['con letras', '+34abc111222'],
  ])('responde 400 con teléfono %s', async (_caso, phone) => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId, name: 'X', phone, acceptsReminders: true });

    expect(res.status).toBe(400);
    expect(json(res)).toEqual({ error: anyString });
  });

  it.each([
    ['name vacío', { name: '', acceptsReminders: true }],
    ['name ausente', { acceptsReminders: true }],
    ['acceptsReminders como string', { name: 'X', acceptsReminders: 'true' }],
    ['acceptsReminders ausente', { name: 'X' }],
    ['phone numérico', { name: 'X', phone: 34600111222, acceptsReminders: true }],
  ])('responde 400 con %s', async (_caso, body) => {
    const res = await request(app).post('/patients').send({ clinicId, ...body });

    expect(res.status).toBe(400);
    expect(json(res)).toEqual({ error: anyString });
  });

  it('responde 400 con clinicId ausente', async () => {
    const res = await request(app).post('/patients').send({ name: 'X', acceptsReminders: true });

    expect(res.status).toBe(400);
  });

  it('responde 404 con un clinicId que no existe', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId: randomUUID(), name: 'X', phone: null, acceptsReminders: true });

    expect(res.status).toBe(404);
    expect(json(res)).toEqual({ error: anyString });
  });

  it('responde 404 con un clinicId que no es UUID', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId: 'abc', name: 'X', phone: null, acceptsReminders: true });

    expect(res.status).toBe(404);
    expect(json(res)).toEqual({ error: anyString });
  });

  it('prioriza el 400 de esquema sobre el 404', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId: randomUUID(), name: '', acceptsReminders: 'si' });

    expect(res.status).toBe(400);
  });

  it('prioriza el 400 de teléfono sobre el 404 de clínica', async () => {
    const res = await request(app)
      .post('/patients')
      .send({ clinicId: randomUUID(), name: 'X', phone: '600111222', acceptsReminders: true });

    expect(res.status).toBe(400);
  });
});
