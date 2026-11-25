/**
 * Base de datos de los tests de integración: la misma `clinicsay` que usa el servicio, salvo que
 * `DATABASE_URL` diga otra. La crea `test/support/global-setup.ts` si no existe.
 * Ojo: varios tests hacen TRUNCATE de sus tablas.
 */
export const TEST_DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5432/clinicsay';
