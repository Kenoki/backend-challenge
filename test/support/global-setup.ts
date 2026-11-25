import { ensureDatabase } from '../../src/infrastructure/db/ensure-database.js';
import { TEST_DATABASE_URL } from './database-url.js';

/** Antes de cualquier test: crea la base de los tests si no existe (como hace el servicio al arrancar). */
export default async function setup(): Promise<void> {
  // Los tests unitarios no necesitan Postgres: si no hay servidor, no se bloquea la ejecución.
  await ensureDatabase(TEST_DATABASE_URL).catch((err: unknown) => {
    console.warn(`No se pudo comprobar la base de tests (${String(err)}); los tests de integración fallarán.`);
  });
}
