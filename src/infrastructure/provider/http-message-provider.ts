import type { DeliveryOutcome, MessageProvider, SendMessage } from '../../application/ports/message-provider.js';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Cliente HTTP del proveedor. Es el único sitio que conoce sus códigos:
 * 200/202 -> delivered; 4xx -> rejected (no se reintenta); 5xx (503, 504...), error de red y timeout -> retryable.
 */
export class HttpMessageProvider implements MessageProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async send({ idempotencyKey, to, text }: SendMessage): Promise<DeliveryOutcome> {
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ to, text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return outcomeOf(res.status);
    } catch {
      return { kind: 'retryable' };
    }
  }
}

function outcomeOf(status: number): DeliveryOutcome {
  if (status === 200 || status === 202) return { kind: 'delivered' };
  if (status >= 400 && status < 500) return { kind: 'rejected' };
  return { kind: 'retryable' };
}
