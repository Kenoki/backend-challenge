import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpMessageProvider } from '../../src/infrastructure/provider/http-message-provider.js';

const providerUrl = process.env['PROVIDER_URL'] ?? 'http://localhost:4010';
const provider = new HttpMessageProvider(providerUrl);

async function admin(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${providerUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.status).toBe(204);
}

async function getJson<T>(path: string): Promise<T> {
  return (await (await fetch(`${providerUrl}${path}`)).json()) as T;
}

beforeEach(async () => {
  await admin('/admin/reset');
});

describe('HttpMessageProvider contra el proveedor real', () => {
  it('202 -> delivered, con la Idempotency-Key y el cuerpo { to, text }', async () => {
    const key = randomUUID();

    const outcome = await provider.send({ idempotencyKey: key, to: '+34600000001', text: 'hola' });

    expect(outcome).toEqual({ kind: 'delivered' });
    const requests = await getJson<unknown[]>('/admin/requests?to=%2B34600000001');
    expect(requests).toEqual([
      expect.objectContaining({ idempotencyKey: key, to: '+34600000001', text: 'hola', status: 202 }),
    ]);
  });

  it('503 (unavailable) -> retryable', async () => {
    await admin('/admin/rules', { to: '+34600000002', mode: 'unavailable', count: 1 });

    const outcome = await provider.send({ idempotencyKey: randomUUID(), to: '+34600000002', text: 'hola' });

    expect(outcome).toEqual({ kind: 'retryable' });
    expect(await getJson<unknown[]>('/admin/messages?to=%2B34600000002')).toEqual([]);
  });

  it('504 con entrega (lost-response) -> retryable y el reintento con la misma key es delivered sin duplicar', async () => {
    await admin('/admin/rules', { to: '+34600000003', mode: 'lost-response', count: 1 });
    const key = randomUUID();

    const first = await provider.send({ idempotencyKey: key, to: '+34600000003', text: 'hola' });
    const second = await provider.send({ idempotencyKey: key, to: '+34600000003', text: 'hola' });

    expect(first).toEqual({ kind: 'retryable' });
    expect(second).toEqual({ kind: 'delivered' });
    expect(await getJson<unknown[]>('/admin/messages?to=%2B34600000003')).toHaveLength(1);
  });

  it('422 (reject) -> rejected', async () => {
    await admin('/admin/rules', { to: '+34600000004', mode: 'reject', count: 1 });

    const outcome = await provider.send({ idempotencyKey: randomUUID(), to: '+34600000004', text: 'hola' });

    expect(outcome).toEqual({ kind: 'rejected' });
  });

  it('400 (teléfono no E.164) -> rejected', async () => {
    const outcome = await provider.send({ idempotencyKey: randomUUID(), to: '600000005', text: 'hola' });

    expect(outcome).toEqual({ kind: 'rejected' });
  });

  it('error de red (nadie escucha) -> retryable', async () => {
    const unreachable = new HttpMessageProvider('http://localhost:1');

    expect(await unreachable.send({ idempotencyKey: randomUUID(), to: '+34600000006', text: 'hola' })).toEqual({
      kind: 'retryable',
    });
  });
});

describe('HttpMessageProvider: traducción de códigos y timeout', () => {
  let server: Server;
  let baseUrl: string;
  let status = 200;
  let delayMs = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end('{}');
      }, delayMs);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    delayMs = 0;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each([
    [200, 'delivered'],
    [202, 'delivered'],
    [500, 'retryable'],
    [502, 'retryable'],
    [503, 'retryable'],
    [504, 'retryable'],
    [400, 'rejected'],
    [404, 'rejected'],
    [422, 'rejected'],
    [429, 'rejected'],
  ])('HTTP %i -> %s', async (code, kind) => {
    status = code;

    const outcome = await new HttpMessageProvider(baseUrl).send({ idempotencyKey: randomUUID(), to: '+34600000007', text: 'x' });

    expect(outcome).toEqual({ kind });
  });

  it('sin respuesta antes del timeout -> retryable', async () => {
    status = 202;
    delayMs = 1000;
    const started = performance.now();

    const outcome = await new HttpMessageProvider(baseUrl, 100).send({ idempotencyKey: randomUUID(), to: '+34600000008', text: 'x' });

    expect(outcome).toEqual({ kind: 'retryable' });
    expect(performance.now() - started).toBeLessThan(900);
  });
});
