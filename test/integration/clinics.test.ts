import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeCreateClinic } from '../../src/application/create-clinic.js';
import { createApp } from '../../src/http/app.js';
import { createDb } from '../../src/infrastructure/db/database.js';
import { KyselyClinicRepository } from '../../src/infrastructure/db/kysely-clinic-repository.js';
import { migrate } from '../../src/infrastructure/db/migrator.js';

const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const pool = new Pool({ connectionString: databaseUrl });
const db = createDb(pool);
const repository = new KyselyClinicRepository(db);
const app = createApp({ useCases: { createClinic: makeCreateClinic({ clinics: repository }) } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (res: request.Response): unknown => res.body;
const idOf = (res: request.Response): string => (res.body as { id: string }).id;

const anyString = expect.any(String) as string;
const anyUuid = expect.stringMatching(UUID) as string;

beforeAll(async () => {
  await migrate(pool);
});

afterAll(async () => {
  await pool.end();
});

describe('POST /clinics', () => {
  it.each(['Europe/Madrid', 'Atlantic/Canary'])('crea una clínica con la zona %s', async (timezone) => {
    const name = `Clínica ${randomUUID()}`;

    const res = await request(app).post('/clinics').send({ name, timezone });

    expect(res.status).toBe(201);
    expect(json(res)).toEqual({ id: anyUuid, name, timezone });
  });

  it('persiste la clínica creada', async () => {
    const res = await request(app)
      .post('/clinics')
      .send({ name: 'Persistida', timezone: 'Europe/Madrid' });

    const stored = await repository.findById(idOf(res));

    expect(stored?.name).toBe('Persistida');
    expect(stored?.timeZone.name).toBe('Europe/Madrid');
    const { rows } = await pool.query('SELECT name, timezone FROM clinics WHERE id = $1', [idOf(res)]);
    expect(rows).toEqual([{ name: 'Persistida', timezone: 'Europe/Madrid' }]);
  });

  it('genera un id distinto en cada alta', async () => {
    const body = { name: 'Gemela', timezone: 'Europe/Madrid' };
    const a = await request(app).post('/clinics').send(body);
    const b = await request(app).post('/clinics').send(body);
    expect(idOf(a)).not.toBe(idOf(b));
  });

  it.each([
    ['name vacío', { name: '', timezone: 'Europe/Madrid' }],
    ['name ausente', { timezone: 'Europe/Madrid' }],
    ['timezone con errata', { name: 'X', timezone: 'Europe/Madird' }],
    ['timezone inventada', { name: 'X', timezone: 'GMT+1 inventada' }],
    ['timezone vacía', { name: 'X', timezone: '' }],
    ['timezone ausente', { name: 'X' }],
  ])('responde 400 con %s', async (_caso, body) => {
    const res = await request(app).post('/clinics').send(body);

    expect(res.status).toBe(400);
    expect(json(res)).toEqual({ error: anyString });
  });

  it('responde 400 con JSON malformado', async () => {
    const res = await request(app)
      .post('/clinics')
      .set('content-type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(json(res)).toEqual({ error: anyString });
  });
});
