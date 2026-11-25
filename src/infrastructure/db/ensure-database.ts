import { Client } from 'pg';

const MAINTENANCE_DB = 'postgres';
// Dos CREATE simultáneos pueden fallar con 42P04 o, si chocan en el catálogo, con 23505.
const RACE_CODES = new Set(['42P04', '23505']);

function targetDatabase(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

/**
 * Crea la base indicada en `databaseUrl` si no existe, conectando a la base de
 * mantenimiento del mismo servidor. Devuelve true si la creó esta llamada.
 * `CREATE DATABASE` no admite transacción ni parámetros: el nombre se escapa como identificador.
 */
export async function ensureDatabase(databaseUrl: string): Promise<boolean> {
  const url = new URL(databaseUrl);
  const name = targetDatabase(url);
  if (name === '' || name === MAINTENANCE_DB) return false;

  url.pathname = `/${MAINTENANCE_DB}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount) return false;
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
    return true;
  } catch (err) {
    // Otra instancia la creó entre la consulta y el CREATE.
    if (RACE_CODES.has((err as { code?: string }).code ?? '')) return false;
    throw err;
  } finally {
    await client.end();
  }
}
