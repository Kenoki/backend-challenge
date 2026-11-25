import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createApp } from '../../src/http/app.js';

describe('traducción de errores de dominio a HTTP', () => {
  it.each([
    ['ValidationError', new ValidationError('dato malo'), 400],
    ['NotFoundError', new NotFoundError('no existe'), 404],
    ['ConflictError', new ConflictError('choca'), 409],
  ])('%s responde con su código y { error }', async (_n, error, status) => {
    const app = createApp({
      registerRoutes: (router) => {
        router.get('/boom', () => {
          throw error;
        });
      },
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: error.message });
  });
});
