import { canReceiveReply, cancelAppointment, confirmAppointment } from '../domain/appointment.js';
import { parseReply } from '../domain/patient-reply.js';
import type { Clock } from './ports/clock.js';
import type { InboundOutcome } from './ports/inbound-message-repository.js';
import type { UnitOfWork } from './ports/unit-of-work.js';

export interface InboundMessageInput {
  messageId: string;
  from: string;
  text: string;
  receivedAt: Date;
}

export type HandleInboundMessageUseCase = (message: InboundMessageInput) => Promise<void>;

/**
 * Caso de uso: aplica la respuesta de un paciente. Todo en una transacción: primero registra el `messageId`
 * (si ya estaba, no hace nada, aunque la vez anterior se ignorara); después busca la cita destino, la bloquea,
 * vuelve a comprobar que sigue siéndolo y confirma o cancela. "Ahora" es la hora del servicio.
 */
export function makeHandleInboundMessage(deps: { unitOfWork: UnitOfWork; clock: Clock }): HandleInboundMessageUseCase {
  return ({ messageId, from, text, receivedAt }) =>
    deps.unitOfWork.run(async ({ appointments, inboundMessages }) => {
      if (!(await inboundMessages.record({ messageId, receivedAt }))) return;
      const intent = parseReply(text);
      const now = deps.clock.now();
      const targetId = intent ? await appointments.findReplyTargetId(from, now) : null;
      const appointment = targetId ? await appointments.findByIdForUpdate(targetId) : null;
      let outcome: InboundOutcome = 'ignored';
      if (intent && appointment && canReceiveReply(appointment, now)) {
        await appointments.save(intent === 'confirm' ? confirmAppointment(appointment) : cancelAppointment(appointment));
        outcome = intent === 'confirm' ? 'confirmed' : 'cancelled';
      }
      await inboundMessages.setOutcome(messageId, outcome);
    });
}
