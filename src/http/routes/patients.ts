import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { CreatePatient } from '../../application/create-patient.js';
import type { Patient } from '../../domain/patient.js';

const bodySchema = z.object({
  clinicId: z.string(),
  name: z.string().min(1),
  phone: z.string().nullable().default(null),
  acceptsReminders: z.boolean(),
});

/** Presentación: la forma `Patient` del contrato OpenAPI. */
function toPatientResponse(patient: Patient): {
  id: string;
  clinicId: string;
  name: string;
  phone: string | null;
  acceptsReminders: boolean;
} {
  return {
    id: patient.id,
    clinicId: patient.clinicId,
    name: patient.name,
    phone: patient.phone?.value ?? null,
    acceptsReminders: patient.acceptsReminders,
  };
}

export function patientsRouter(createPatient: CreatePatient): Router {
  const router = Router();
  router.post('/patients', async (req: Request, res: Response) => {
    const patient = await createPatient(bodySchema.parse(req.body));
    res.status(201).json(toPatientResponse(patient));
  });
  return router;
}
