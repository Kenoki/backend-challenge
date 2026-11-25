import { defineConfig } from 'vitest/config';

// Stryker solo ejecuta los tests unitarios: son rápidos y no necesitan Postgres.
export default defineConfig({
  test: { include: ['test/unit/**/*.test.ts'] },
});
