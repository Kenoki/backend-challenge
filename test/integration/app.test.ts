import request from 'supertest';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/http/app.js';

const app = createApp({});

describe('app HTTP base', () => {
  it('responde 404 con JSON a una ruta desconocida', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('responde 400 con JSON malformado', async () => {
    const res = await request(app)
      .post('/no-existe')
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
  });
});

describe('manejo de errores', () => {
  const appWithRoutes = createApp({
    registerRoutes: (router) => {
      router.get('/zod', () => {
        z.object({ name: z.string() }).parse({});
      });
      router.get('/boom', () => {
        throw new Error('secreto interno');
      });
    },
  });

  it('responde 400 legible ante un ZodError', async () => {
    const res = await request(appWithRoutes).get('/zod');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.stringContaining('name') as unknown });
  });

  it('responde 500 genérico sin filtrar detalles', async () => {
    const res = await request(appWithRoutes).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
