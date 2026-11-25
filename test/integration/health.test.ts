import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/http/app.js';
import { migrate } from '../../src/infrastructure/db/migrator.js';

const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const pool = new Pool({ connectionString: databaseUrl });

afterAll(async () => {
  await pool.end();
});

describe('/health', () => {
  it('responde 200 con la base migrada, aunque se migre dos veces', async () => {
    await migrate(pool);
    await migrate(pool);
    const app = createApp({ checkDatabase: async () => void (await pool.query('SELECT 1')) });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('crea las tablas del esquema inicial', async () => {
    await migrate(pool);
    const { rows } = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining(['clinics', 'patients', 'appointments', 'reminders', 'inbound_messages']),
    );
  });

  it('dos migraciones simultáneas no chocan', async () => {
    await expect(Promise.all([migrate(pool), migrate(pool)])).resolves.toBeDefined();
  });

  it('responde 503 si la comprobación de base falla', async () => {
    const app = createApp({
      checkDatabase: () => Promise.reject(new Error('conexión caída')),
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Database unavailable' });
  });
});
