import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toGeminiJsonSchema } from './json-schema';
import { AIRateLimiter } from './limiter';
import type { CounterStore } from './limiter';
import { FakeAIProvider, UnconfiguredAIProvider } from './providers/fake';
import { brandProfileOutputSchema } from './prompts/brand-profile.v1';
import { AIError } from './types';

function memoryStore(): CounterStore & { data: Map<string, number> } {
  const data = new Map<string, number>();
  return {
    data,
    async incr(key) {
      const v = (data.get(key) ?? 0) + 1;
      data.set(key, v);
      return v;
    },
    async expire() {
      return 1;
    },
  };
}

describe('AIRateLimiter', () => {
  it('günlük bütçe dolunca ertesi güne kadar bekleme süresiyle budget_exceeded fırlatır', async () => {
    const now = Date.parse('2026-10-09T22:00:00Z');
    const limiter = new AIRateLimiter(memoryStore(), { dailyBudget: 2, maxConcurrency: 5, now: () => now });
    (await limiter.acquire())();
    (await limiter.acquire())();
    const err = await limiter.acquire().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err).toMatchObject({ code: 'budget_exceeded', retryAfterMs: 2 * 3_600_000 });
  });

  it('dakikalık limit dolunca sonraki dakikayı bekler', async () => {
    let now = Date.parse('2026-10-09T10:00:30Z');
    const waits: number[] = [];
    const limiter = new AIRateLimiter(memoryStore(), {
      rpm: 1,
      maxConcurrency: 5,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    (await limiter.acquire())();
    (await limiter.acquire())();
    expect(waits).toEqual([30_050]);
  });

  it('eşzamanlılık sınırı: yuva bırakılana kadar sonraki çağrı bekler', async () => {
    const limiter = new AIRateLimiter(null, { maxConcurrency: 1 });
    const release = await limiter.acquire();
    let second = false;
    const pending = limiter.acquire().then((r) => {
      second = true;
      r();
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(second).toBe(false);
    release();
    await pending;
    expect(second).toBe(true);
  });
});

describe('toGeminiJsonSchema', () => {
  it('desteklenmeyen anahtarları atar, yapıyı korur', () => {
    const schema = toGeminiJsonSchema(z.object({ name: z.string().min(1).max(10), tags: z.array(z.string()).max(3) })) as Record<string, unknown>;
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).toMatchObject({ type: 'object', required: ['name', 'tags'], properties: { name: { type: 'string' }, tags: { type: 'array', maxItems: 3 } } });
    expect((schema.properties as Record<string, Record<string, unknown>>).name).not.toHaveProperty('minLength');
  });

  it('marka profili şeması dönüştürülebilir', () => {
    expect(toGeminiJsonSchema(brandProfileOutputSchema)).toMatchObject({ type: 'object' });
  });
});

describe('sahte sağlayıcılar', () => {
  it('FakeAIProvider yanıtı şemayla doğrular, tanımsız işlemde invalid_output verir', async () => {
    const ai = new FakeAIProvider({ ok: () => ({ n: 1 }) });
    const res = await ai.generateStructured({ operation: 'ok', system: '', prompt: 'p', schema: z.object({ n: z.number() }), model: 'fast' });
    expect(res.data).toEqual({ n: 1 });
    await expect(ai.generateText({ operation: 'missing', system: '', prompt: '', model: 'fast' })).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('anahtar yokken çökmez, not_configured hatası verir', async () => {
    const ai = new UnconfiguredAIProvider();
    expect(ai.configured).toBe(false);
    await expect(ai.generateText()).rejects.toMatchObject({ code: 'not_configured' });
  });
});
