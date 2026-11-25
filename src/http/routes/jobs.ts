import { Router, type Request, type Response } from 'express';
import type { RunRemindersUseCase } from '../../application/run-reminders.js';

export function jobsRouter(runReminders: RunRemindersUseCase): Router {
  const router = Router();
  router.post('/jobs/reminders/run', async (_req: Request, res: Response) => {
    res.status(200).json(await runReminders());
  });
  return router;
}
