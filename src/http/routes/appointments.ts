import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { CreateAppointmentUseCase } from '../../application/create-appointment.js';
import type { GetAppointment } from '../../application/get-appointment.js';
import type { Appointment } from '../../domain/appointment.js';
import type { Reminder } from '../../domain/reminder.js';
import { isoDateTimeWithZone } from '../schemas.js';

const bodySchema = z.object({
  clinicId: z.string(),
  patientId: z.string(),
  startsAt: isoDateTimeWithZone,
});

interface ReminderResponse {
  id: string;
  scheduledFor: string;
  status: Reminder['status'];
  attempts: number;
  sentAt: string | null;
  skipReason: string | null;
}

/** Presentación: la forma `Reminder` del contrato OpenAPI, con fechas en ISO UTC. */
function toReminderResponse(reminder: Reminder): ReminderResponse {
  return {
    id: reminder.id,
    scheduledFor: reminder.scheduledFor.toISOString(),
    status: reminder.status,
    attempts: reminder.attempts,
    sentAt: reminder.status === 'sent' ? reminder.sentAt.toISOString() : null,
    skipReason: reminder.status === 'skipped' ? reminder.skipReason : null,
  };
}

/** Presentación: la forma `Appointment` del contrato OpenAPI. */
function toAppointmentResponse(appointment: Appointment): {
  id: string;
  clinicId: string;
  patientId: string;
  startsAt: string;
  status: string;
  reminders: ReminderResponse[];
} {
  return {
    id: appointment.id,
    clinicId: appointment.clinicId,
    patientId: appointment.patientId,
    startsAt: appointment.startsAt.toISOString(),
    status: appointment.status,
    reminders: appointment.reminders.map(toReminderResponse),
  };
}

export function appointmentsRouter(useCases: {
  createAppointment: CreateAppointmentUseCase;
  getAppointment: GetAppointment;
}): Router {
  const router = Router();
  router.post('/appointments', async (req: Request, res: Response) => {
    const appointment = await useCases.createAppointment(bodySchema.parse(req.body));
    res.status(201).json(toAppointmentResponse(appointment));
  });
  router.get('/appointments/:id', async (req: Request<{ id: string }>, res: Response) => {
    res.json(toAppointmentResponse(await useCases.getAppointment(req.params.id)));
  });
  return router;
}
