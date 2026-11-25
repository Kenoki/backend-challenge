import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/http/app.js';
import { TestClock } from '../../src/infrastructure/clock/test-clock.js';

function appWithClock(): { app: ReturnType<typeof createApp>; clock: TestClock } {
  const clock = new TestClock();
  return { app: createApp({ testClock: clock }), clock };
}

function expectErrorBody(body: unknown): void {
  expect(Object.keys(body as object)).toEqual(['error']);
  expect(typeof (body as { error: unknown }).error).toBe('string');
}

describe('PUT /test/clock', () => {
  it('fija la hora con zona Z y responde 204 sin cuerpo', async () => {
    const { app, clock } = appWithClock();

    const res = await request(app).put('/test/clock').send({ now: '2027-03-27T08:00:00Z' });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(clock.now().toISOString()).toBe('2027-03-27T08:00:00.000Z');
  });

  it('respeta el offset: 10:00+02:00 son las 08:00 UTC', async () => {
    const { app, clock } = appWithClock();

    const res = await request(app).put('/test/clock').send({ now: '2027-03-27T10:00:00+02:00' });

    expect(res.status).toBe(204);
    expect(clock.now().toISOString()).toBe('2027-03-27T08:00:00.000Z');
  });

  it('rechaza un now sin zona con 400 y { error }', async () => {
    const { app, clock } = appWithClock();
    await request(app).put('/test/clock').send({ now: '2027-03-27T08:00:00Z' });

    const res = await request(app).put('/test/clock').send({ now: '2027-03-27T09:00:00' });

    expect(res.status).toBe(400);
    expectErrorBody(res.body);
    expect(clock.now().toISOString()).toBe('2027-03-27T08:00:00.000Z');
  });

  it.each([
    ['sin body', undefined],
    ['body vacío', {}],
    ['now inválido', { now: 'mañana' }],
    ['now no es texto', { now: 12345 }],
  ])('responde 400 con { error } %s', async (_name, body) => {
    const { app } = appWithClock();

    const res = await request(app).put('/test/clock').send(body);

    expect(res.status).toBe(400);
    expectErrorBody(res.body);
  });

  it('responde 404 si no hay reloj de pruebas inyectado', async () => {
    const res = await request(createApp()).put('/test/clock').send({ now: '2027-03-27T08:00:00Z' });

    expect(res.status).toBe(404);
  });
});
