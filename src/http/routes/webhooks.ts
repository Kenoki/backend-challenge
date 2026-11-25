import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { HandleInboundMessageUseCase } from '../../application/handle-inbound-message.js';
import { isoDateTimeWithZone } from '../schemas.js';

const inboundMessageSchema = z.object({
  messageId: z.string().min(1),
  from: z.string(),
  text: z.string(),
  receivedAt: isoDateTimeWithZone,
});

export function webhooksRouter(handleInboundMessage: HandleInboundMessageUseCase): Router {
  const router = Router();
  // 200 siempre que el cuerpo sea válido, se aplique el mensaje o no; el proveedor solo necesita saber que llegó.
  router.post('/webhooks/inbound-messages', async (req: Request, res: Response) => {
    await handleInboundMessage(inboundMessageSchema.parse(req.body));
    res.status(200).json({ status: 'ok' });
  });
  return router;
}
