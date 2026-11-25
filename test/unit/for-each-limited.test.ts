import { describe, expect, it } from 'vitest';
import { forEachLimited } from '../../src/application/for-each-limited.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('forEachLimited', () => {
  it('procesa todos los elementos sin superar el máximo de tareas simultáneas', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await forEachLimited([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
      done.push(n);
    });
    expect(peak).toBe(3);
    expect(done.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('con menos elementos que el límite no lanza más tareas de las necesarias', async () => {
    let running = 0;
    let peak = 0;
    await forEachLimited([1, 2], 10, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });
    expect(peak).toBe(2);
  });

  it('con una lista vacía termina sin llamar a la tarea', async () => {
    let calls = 0;
    await forEachLimited([], 5, () => {
      calls += 1;
      return Promise.resolve();
    });
    expect(calls).toBe(0);
  });

  it('rechaza si una tarea falla', async () => {
    await expect(forEachLimited([1, 2, 3], 2, (n) => (n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve()))).rejects.toThrow('boom');
  });
});
