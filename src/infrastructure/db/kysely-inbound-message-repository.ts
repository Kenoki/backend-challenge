import type { Kysely } from 'kysely';
import type { InboundMessageRepository, InboundOutcome } from '../../application/ports/inbound-message-repository.js';
import type { Database } from './database.js';

export class KyselyInboundMessageRepository implements InboundMessageRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async record(message: { messageId: string; receivedAt: Date }): Promise<boolean> {
    const result = await this.db
      .insertInto('inbound_messages')
      .values({ message_id: message.messageId, received_at: message.receivedAt, outcome: 'ignored' })
      .onConflict((oc) => oc.column('message_id').doNothing())
      .executeTakeFirst();
    return result.numInsertedOrUpdatedRows === 1n;
  }

  async setOutcome(messageId: string, outcome: InboundOutcome): Promise<void> {
    await this.db.updateTable('inbound_messages').set({ outcome }).where('message_id', '=', messageId).execute();
  }
}
