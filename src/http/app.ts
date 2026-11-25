import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response, type Router } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { testClockRouter, type SettableClock } from './routes/test-clock.js';

export interface AppDeps {
  logger?: Logger;
  httpLogger?: RequestHandler;
  registerRoutes?: (router: Router) => void;
  /** Comprobación de la base; rechaza si no responde. Si se omite no se expone /health. */
  checkDatabase?: () => Promise<void>;
  /** Reloj fijable. Solo si se inyecta se expone PUT /test/clock (CLOCK_MODE=test). */
  testClock?: SettableClock;
}

interface BodyParserError extends Error {
  type?: string;
}

function isInvalidJson(err: unknown): boolean {
  return err instanceof SyntaxError && (err as BodyParserError).type === 'entity.parse.failed';
}

function describeZodError(err: ZodError): string {
  return err.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

export function createApp(deps: AppDeps = {}): Express {
  const app = express();
  if (deps.httpLogger) app.use(deps.httpLogger);
  app.use(express.json());

  const router = express.Router();
  const { checkDatabase } = deps;
  if (checkDatabase) {
    router.get('/health', (_req: Request, res: Response) => {
      checkDatabase().then(
        () => res.status(200).json({ status: 'ok' }),
        (err: unknown) => {
          deps.logger?.error({ err }, 'Health check failed');
          res.status(503).json({ error: 'Database unavailable' });
        },
      );
    });
  }
  if (deps.testClock) router.use(testClockRouter(deps.testClock));
  deps.registerRoutes?.(router);
  app.use(router);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isInvalidJson(err)) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: describeZodError(err) });
      return;
    }
    deps.logger?.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
