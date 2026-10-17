import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { AIError } from '../types';
import type { AIProvider, AIResult, CallMeta, ModelTier, Source } from '../types';

type Responder = (prompt: string) => unknown;

/**
 * Testler için deterministik sağlayıcı: gerçek Gemini'ye istek atılmaz (Bölüm 12).
 * Yanıtlar işlem adına (`operation`) göre verilir; tanımsız işlem `invalid_output` fırlatır.
 */
export class FakeAIProvider implements AIProvider {
  readonly id = 'fake';
  readonly configured = true;
  readonly calls: { operation: string; prompt: string }[] = [];

  constructor(private readonly responders: Record<string, Responder> = {}) {}

  private respond(meta: CallMeta, prompt: string): unknown {
    this.calls.push({ operation: meta.operation, prompt });
    const responder = this.responders[meta.operation];
    if (!responder) throw new AIError('invalid_output', `FakeAIProvider: ${meta.operation} için yanıt tanımlı değil`);
    return responder(prompt);
  }

  private wrap<T>(data: T): AIResult<T> {
    return { data, inputTokens: 10, outputTokens: 10, model: 'fake', latencyMs: 0, costUsd: 0 };
  }

  async generateText(opts: CallMeta & { system: string; prompt: string; model: ModelTier }): Promise<AIResult<string>> {
    return this.wrap(String(this.respond(opts, opts.prompt)));
  }

  async generateStructured<T>(opts: CallMeta & { system: string; prompt: string; schema: z.ZodType<T>; model: ModelTier }): Promise<AIResult<T>> {
    const parsed = opts.schema.safeParse(this.respond(opts, opts.prompt));
    if (!parsed.success) throw new AIError('invalid_output', parsed.error.message);
    return this.wrap(parsed.data);
  }

  async generateGrounded(opts: CallMeta & { prompt: string; model: ModelTier }): Promise<AIResult<{ text: string; sources: Source[] }>> {
    return this.wrap({ text: String(this.respond(opts, opts.prompt)), sources: [] });
  }

  async generateImage(opts: CallMeta & { prompt: string }): Promise<AIResult<{ data: Buffer; mimeType: string }>> {
    const value = this.respond(opts, opts.prompt);
    if (!(value instanceof Buffer)) throw new AIError('not_configured', 'FakeAIProvider: görsel yok');
    return this.wrap({ data: value, mimeType: 'image/png' });
  }

  /** Kelime torbası vektörü (deterministik): ortak kelimesi çok olan metinler birbirine yakın çıkar. */
  async embed(opts: CallMeta & { texts: string[]; dimensions?: number }): Promise<AIResult<number[][]>> {
    this.calls.push({ operation: opts.operation, prompt: opts.texts.join('\n') });
    const size = opts.dimensions ?? 64;
    return this.wrap(
      opts.texts.map((text) => {
        const v = new Array<number>(size).fill(0);
        for (const word of text.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2)) {
          const stem = word.slice(0, 5);
          v[parseInt(createHash('md5').update(stem).digest('hex').slice(0, 8), 16) % size]! += 1;
        }
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return v.map((x) => x / norm);
      }),
    );
  }
}

/** Anahtar tanımlı değilken kullanılır: uygulama çökmez, çağıran `not_configured` hatasını yakalar. */
export class UnconfiguredAIProvider implements AIProvider {
  readonly id = 'none';
  readonly configured = false;
  private fail(): never {
    throw new AIError('not_configured', 'GEMINI_API_KEY tanımlı değil');
  }
  async generateText(): Promise<AIResult<string>> {
    return this.fail();
  }
  async generateStructured<T>(): Promise<AIResult<T>> {
    return this.fail();
  }
  async generateGrounded(): Promise<AIResult<{ text: string; sources: Source[] }>> {
    return this.fail();
  }
  async embed(): Promise<AIResult<number[][]>> {
    return this.fail();
  }
  async generateImage(): Promise<AIResult<{ data: Buffer; mimeType: string }>> {
    return this.fail();
  }
}
