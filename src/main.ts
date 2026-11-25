import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { createApp } from './http/app.js';

const port = Number(process.env['PORT'] ?? 3000);
const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const app = createApp({ logger, httpLogger: pinoHttp({ logger }) });
app.listen(port, () => {
  logger.info({ port }, 'Server listening');
});
