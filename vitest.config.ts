import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // Los tests de integración comparten Postgres y el proveedor, y la pasada de envío trata todos
    // los recordatorios vencidos de la base: los archivos se ejecutan uno tras otro.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        'src/domain/**': { lines: 90 },
      },
    },
  },
});
