import { Pool } from 'pg';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { createApp } from './http/app.js';
import { migrate } from './infrastructure/db/migrator.js';

const port = Number(process.env['PORT'] ?? 3000);
const databaseUrl = process.env['DATABASE_URL'];
const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

async function main(): Promise<void> {
  if (!databaseUrl) throw new Error('DATABASE_URL es obligatoria');
  const pool = new Pool({ connectionString: databaseUrl });
  await migrate(pool);
  logger.info('Migraciones aplicadas');

  const app = createApp({
    logger,
    httpLogger: pinoHttp({ logger }),
    checkDatabase: async () => {
      await pool.query('SELECT 1');
    },
  });
  const server = app.listen(port, () => {
    logger.info({ port }, 'Server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Cerrando');
    server.close(() => {
      pool.end().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'No se pudo arrancar');
  process.exit(1);
});
