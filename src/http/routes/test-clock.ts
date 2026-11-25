import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { isoDateTimeWithZone } from '../schemas.js';

/** Lo mínimo que necesita la ruta de un reloj fijable. */
export interface SettableClock {
  set(at: Date): void;
}

const bodySchema = z.object({ now: isoDateTimeWithZone });

export function testClockRouter(clock: SettableClock): Router {
  const router = Router();
  router.put('/test/clock', (req: Request, res: Response) => {
    const { now } = bodySchema.parse(req.body);
    clock.set(now);
    res.status(204).end();
  });
  return router;
}
