import { TEST_DATABASE_URL } from '../support/database-url.js';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { ensureDatabase } from '../../src/infrastructure/db/ensure-database.js';

const baseUrl =
  TEST_DATABASE_URL;

function urlFor(dbName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${encodeURIComponent(dbName)}`;
  return url.toString();
}

function randomName(prefix: string): string {
  return `${prefix}${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

const created: string[] = [];

async function withAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = new URL(baseUrl);
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function exists(name: string): Promise<boolean> {
  return withAdmin(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    return rowCount === 1;
  });
}

afterAll(async () => {
  await withAdmin(async (c) => {
    for (const name of created) {
      await c.query(`DROP DATABASE IF EXISTS ${c.escapeIdentifier(name)}`);
    }
  });
});

describe('ensureDatabase', () => {
  it('crea la base la primera vez y no hace nada la segunda', async () => {
    const name = randomName('t18_');
    created.push(name);

    expect(await ensureDatabase(urlFor(name))).toBe(true);
    expect(await exists(name)).toBe(true);
    expect(await ensureDatabase(urlFor(name))).toBe(false);
  });

  it('dos llamadas concurrentes no fallan y solo una la crea', async () => {
    const name = randomName('t18_');
    created.push(name);

    const results = await Promise.all([ensureDatabase(urlFor(name)), ensureDatabase(urlFor(name))]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await exists(name)).toBe(true);
  });

  it('escapa el nombre: mayúsculas y guiones se crean tal cual', async () => {
    const name = randomName('T18-Raro_');
    created.push(name);

    expect(await ensureDatabase(urlFor(name))).toBe(true);
    expect(await exists(name)).toBe(true);
  });

  it('con la base de mantenimiento no hace nada', async () => {
    expect(await ensureDatabase(urlFor('postgres'))).toBe(false);
  });
});
