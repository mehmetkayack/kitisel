import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import type { GenerateContentConfig, GenerateContentResponse } from '@google/genai';
import type { z } from 'zod';
import { toGeminiJsonSchema } from '../json-schema';
import type { AIRateLimiter } from '../limiter';
import { AIError } from '../types';
import type { AIProvider, AIResult, AIUsageEvent, CallMeta, ModelTier, Source } from '../types';

export interface ModelPrice {
  /** USD / 1M input token */
  input: number;
  /** USD / 1M output token */
  output: number;
}

export interface GeminiOptions {
  apiKey: string;
  models: { fast?: string; quality?: string; reasoning?: string; embedding?: string; image?: string };
  limiter: AIRateLimiter;
  onUsage?: (event: AIUsageEvent) => void;
  /** Model adı → fiyat. Tanımsızsa maliyet 0 yazılır (ücretsiz katman). */
  pricing?: Record<string, ModelPrice>;
  /** Hızlı 503'te aynı modeli yeniden denemeden önce bekleme (ilk eleman kullanılır) */
  retryDelaysMs?: number[];
  /** Tek çağrı için en fazla bekleme (yoğunlukta yanıt gelmeyebiliyor); aşılırsa geçici hata */
  requestTimeoutMs?: number;
}

const BLOCKED_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

interface RawCall {
  response: GenerateContentResponse;
  model: string;
  latencyMs: number;
}

/**
 * Google Gemini (`@google/genai`, `models.generateContent`). Her çağrı: hız sınırlayıcı →
 * geçici hatada yeniden deneme → `quality` modeli aşırı yüklüyse `fast` modele düşme → kullanım logu.
 */
export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  readonly configured = true;
  private readonly client: GoogleGenAI;

  constructor(private readonly opts: GeminiOptions) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
  }

  private modelFor(tier: ModelTier): string {
    const m = this.opts.models;
    const name = tier === 'reasoning' ? (m.reasoning ?? m.quality ?? m.fast) : tier === 'quality' ? (m.quality ?? m.fast) : (m.fast ?? m.quality);
    if (!name) throw new AIError('not_configured', 'GEMINI_MODEL_* tanımlı değil');
    return name;
  }

  private cost(model: string, input: number, output: number): number {
    const price = this.opts.pricing?.[model];
    if (!price) return 0;
    return (input * price.input + output * price.output) / 1_000_000;
  }

  private log(meta: CallMeta, model: string, latencyMs: number, response: GenerateContentResponse | null, error?: AIError): void {
    const input = response?.usageMetadata?.promptTokenCount ?? 0;
    const output = (response?.usageMetadata?.candidatesTokenCount ?? 0) + (response?.usageMetadata?.thoughtsTokenCount ?? 0);
    this.opts.onUsage?.({
      operation: meta.operation,
      model,
      inputTokens: input,
      outputTokens: output,
      costUsd: this.cost(model, input, output),
      latencyMs,
      success: !error,
      errorCode: error?.code,
    });
  }

  private static toAIError(err: unknown): AIError {
    if (err instanceof AIError) return err;
    if (err instanceof ApiError) {
      if (err.status === 429) return new AIError('rate_limited', err.message, 30_000);
      // Anahtar/model tanımlı ama sağlayıcı kabul etmiyor: "kurulu değil"den ayrı (panelde farklı mesaj)
      if (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 404) return new AIError('rejected', err.message);
      return new AIError('unavailable', err.message, 10_000);
    }
    // İstek zaman aşımı (abortSignal) — model yanıt vermiyor
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return new AIError('unavailable', 'timeout', 10_000);
    return new AIError('unavailable', err instanceof Error ? err.message : String(err), 10_000);
  }

  /** Google Search kotası yoksa (ücretsiz katmanda 429) bir süre denenmez; çağıranlar grounding'siz devam eder. */
  private groundingPausedUntil = 0;

  /**
   * Tek bir generateContent çağrısı. Strateji (yoğunluk ve ücretsiz katman kotaları için):
   * - hızlı 503: aynı modelde bir kez daha (1,5 sn sonra), sonra yedek (`fast`) modele,
   * - zaman aşımı veya 429: beklemeden yedek modele (kotalar model başınadır),
   * - diğer hatalar: hemen çağırana.
   */
  private async call(meta: CallMeta, tier: ModelTier, contents: string, config: GenerateContentConfig): Promise<RawCall> {
    const primary = this.modelFor(tier);
    const fallback = tier === 'fast' ? undefined : this.opts.models.fast;
    const models = fallback && fallback !== primary ? [primary, fallback] : [primary];
    const retryDelay = this.opts.retryDelaysMs?.[0] ?? 1_500;

    let lastError: AIError | undefined;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const release = await this.opts.limiter.acquire();
        const started = Date.now();
        try {
          const response = await this.client.models.generateContent({
            model,
            contents,
            config: { ...config, abortSignal: AbortSignal.timeout(this.opts.requestTimeoutMs ?? 120_000) },
          });
          const latencyMs = Date.now() - started;
          const finish = response.candidates?.[0]?.finishReason;
          if (response.promptFeedback?.blockReason || (finish && BLOCKED_REASONS.has(finish))) {
            const err = new AIError('blocked', `Yanıt engellendi: ${response.promptFeedback?.blockReason ?? finish}`);
            this.log(meta, model, latencyMs, response, err);
            throw err;
          }
          this.log(meta, model, latencyMs, response);
          return { response, model, latencyMs };
        } catch (err) {
          const aiErr = GeminiProvider.toAIError(err);
          if (!(err instanceof AIError)) this.log(meta, model, Date.now() - started, null, aiErr);
          lastError = aiErr;
          const quick503 = aiErr.code === 'unavailable' && aiErr.message !== 'timeout';
          if (quick503 && attempt === 0) {
            await new Promise((r) => setTimeout(r, retryDelay));
            continue;
          }
          if (aiErr.code === 'unavailable' || aiErr.code === 'rate_limited') break; // sıradaki modele
          throw aiErr;
        } finally {
          release();
        }
      }
    }
    throw lastError ?? new AIError('unavailable');
  }

  private result<T>(raw: RawCall, data: T): AIResult<T> {
    const usage = raw.response.usageMetadata;
    const input = usage?.promptTokenCount ?? 0;
    const output = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    return { data, inputTokens: input, outputTokens: output, model: raw.model, latencyMs: raw.latencyMs, costUsd: this.cost(raw.model, input, output) };
  }

  async generateText(opts: CallMeta & { system: string; prompt: string; model: ModelTier; temperature?: number }): Promise<AIResult<string>> {
    const raw = await this.call(opts, opts.model, opts.prompt, { systemInstruction: opts.system, temperature: opts.temperature });
    return this.result(raw, raw.response.text ?? '');
  }

  async generateStructured<T>(opts: CallMeta & { system: string; prompt: string; schema: z.ZodType<T>; model: ModelTier; temperature?: number }): Promise<AIResult<T>> {
    const config: GenerateContentConfig = {
      systemInstruction: opts.system,
      temperature: opts.temperature,
      responseMimeType: 'application/json',
      responseJsonSchema: toGeminiJsonSchema(opts.schema),
    };
    const raw = await this.call(opts, opts.model, opts.prompt, config);
    const first = parseWith(opts.schema, raw.response.text);
    if (first.ok) return this.result(raw, first.data);

    // Bir kez onarım isteği (Bölüm 9): hatayı modele gösterip geçerli JSON istenir.
    const repairPrompt = `${opts.prompt}\n\nYour previous answer did not match the required JSON schema.\nErrors: ${first.error}\nPrevious answer:\n${(raw.response.text ?? '').slice(0, 4000)}\n\nReturn only valid JSON that matches the schema.`;
    const repaired = await this.call({ operation: `${opts.operation}.repair` }, opts.model, repairPrompt, config);
    const second = parseWith(opts.schema, repaired.response.text);
    if (second.ok) return this.result(repaired, second.data);
    throw new AIError('invalid_output', second.error);
  }

  async generateGrounded(opts: CallMeta & { prompt: string; model: ModelTier }): Promise<AIResult<{ text: string; sources: Source[] }>> {
    if (Date.now() < this.groundingPausedUntil) throw new AIError('rate_limited', 'Google Search kotası yok (geçici olarak kapalı)');
    let raw: RawCall;
    try {
      raw = await this.call(opts, opts.model, opts.prompt, { tools: [{ googleSearch: {} }] });
    } catch (err) {
      if (err instanceof AIError && err.code === 'rate_limited') this.groundingPausedUntil = Date.now() + 3_600_000;
      throw err;
    }
    const chunks = raw.response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources: Source[] = [];
    for (const chunk of chunks) {
      const uri = chunk.web?.uri;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({ url: uri, title: chunk.web?.title ?? uri });
    }
    return this.result(raw, { text: raw.response.text ?? '', sources });
  }

  async generateImage(opts: CallMeta & { prompt: string; aspectRatio: '16:9' | '1:1' | '4:5' }): Promise<AIResult<{ data: Buffer; mimeType: string }>> {
    const model = this.opts.models.image;
    if (!model) throw new AIError('not_configured', 'GEMINI_MODEL_IMAGE tanımlı değil');
    const release = await this.opts.limiter.acquire();
    const started = Date.now();
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: opts.prompt,
        config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: opts.aspectRatio }, abortSignal: AbortSignal.timeout(this.opts.requestTimeoutMs ?? 150_000) },
      });
      const latencyMs = Date.now() - started;
      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) {
        const err = new AIError('blocked', 'Görsel üretilmedi');
        this.log(opts, model, latencyMs, response, err);
        throw err;
      }
      this.log(opts, model, latencyMs, response);
      return this.result({ response, model, latencyMs }, { data: Buffer.from(part.inlineData.data, 'base64'), mimeType: part.inlineData.mimeType ?? 'image/png' });
    } catch (err) {
      const aiErr = GeminiProvider.toAIError(err);
      if (!(err instanceof AIError)) this.log(opts, model, Date.now() - started, null, aiErr);
      throw aiErr;
    } finally {
      release();
    }
  }

  async embed(opts: CallMeta & { texts: string[]; dimensions?: number }): Promise<AIResult<number[][]>> {
    const model = this.opts.models.embedding;
    if (!model) throw new AIError('not_configured', 'GEMINI_MODEL_EMBEDDING tanımlı değil');
    const release = await this.opts.limiter.acquire();
    const started = Date.now();
    try {
      const res = await this.client.models.embedContent({
        model,
        contents: opts.texts,
        config: {
          taskType: 'SEMANTIC_SIMILARITY',
          ...(opts.dimensions ? { outputDimensionality: opts.dimensions } : {}),
          abortSignal: AbortSignal.timeout(this.opts.requestTimeoutMs ?? 150_000),
        },
      });
      const latencyMs = Date.now() - started;
      this.opts.onUsage?.({ operation: opts.operation, model, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs, success: true });
      // 3072'den küçük boyutlar normalize gelmiyor (Gemini dokümanı): birim uzunluğa çevrilir.
      const vectors = (res.embeddings ?? []).map((e) => normalizeVector(e.values ?? []));
      return { data: vectors, inputTokens: 0, outputTokens: 0, model, latencyMs, costUsd: 0 };
    } catch (err) {
      const aiErr = GeminiProvider.toAIError(err);
      this.opts.onUsage?.({ operation: opts.operation, model, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: Date.now() - started, success: false, errorCode: aiErr.code });
      throw aiErr;
    } finally {
      release();
    }
  }
}

export function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

function parseWith<T>(schema: z.ZodType<T>, text: string | undefined): { ok: true; data: T } | { ok: false; error: string } {
  if (!text) return { ok: false, error: 'empty response' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'response is not valid JSON' };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
