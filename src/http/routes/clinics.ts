import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { CreateClinic } from '../../application/create-clinic.js';
import type { Clinic } from '../../domain/clinic.js';

const bodySchema = z.object({ name: z.string().min(1), timezone: z.string() });

/** Presentación: la forma `Clinic` del contrato OpenAPI. */
function toClinicResponse(clinic: Clinic): { id: string; name: string; timezone: string } {
  return { id: clinic.id, name: clinic.name, timezone: clinic.timeZone.name };
}

export function clinicsRouter(createClinic: CreateClinic): Router {
  const router = Router();
  router.post('/clinics', async (req: Request, res: Response) => {
    const clinic = await createClinic(bodySchema.parse(req.body));
    res.status(201).json(toClinicResponse(clinic));
  });
  return router;
}
