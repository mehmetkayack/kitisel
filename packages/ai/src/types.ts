import type { z } from 'zod';

/** Model sınıfı. Somut model adları koda gömülmez, `.env`'den gelir (GEMINI_MODEL_*). */
export type ModelTier = 'fast' | 'quality' | 'reasoning';

export interface Source {
  url: string;
  title: string;
}

export interface AIResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  model: string;
  latencyMs: number;
  costUsd: number;
}

/** Her çağrının kaydı (`ai_usage_logs`). */
export interface AIUsageEvent {
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  errorCode?: AIErrorCode;
}

export interface CallMeta {
  /** Kullanım logunda işlem adı, ör. `site.brand_profile` */
  operation: string;
}

export interface AIProvider {
  readonly id: string;
  /** false: anahtar/model tanımlı değil; çağrılar `not_configured` fırlatır. */
  readonly configured: boolean;
  generateText(opts: CallMeta & { system: string; prompt: string; model: ModelTier; temperature?: number }): Promise<AIResult<string>>;
  generateStructured<T>(opts: CallMeta & {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    model: ModelTier;
    temperature?: number;
  }): Promise<AIResult<T>>;
  generateGrounded(opts: CallMeta & { prompt: string; model: ModelTier }): Promise<AIResult<{ text: string; sources: Source[] }>>;
  /**
   * Metin vektörleri (anlamsal benzerlik). `dimensions` verilirse vektör o boyuta indirilir ve birim
   * uzunluğa normalize edilir (cosine = iç çarpım). Konu tekrarı ve iç link seçimi için.
   */
  embed(opts: CallMeta & { texts: string[]; dimensions?: number }): Promise<AIResult<number[][]>>;
  /** Metinsiz görsel (kapak). Model yoksa veya kota yetmezse hata; çağıran kod yedek kapak üretir. */
  generateImage(opts: CallMeta & { prompt: string; aspectRatio: '16:9' | '1:1' | '4:5' }): Promise<AIResult<{ data: Buffer; mimeType: string }>>;
}

export type AIErrorCode =
  /** Anahtar veya model adı yok */
  | 'not_configured'
  /** Sağlayıcı 429 / bizim RPM limitimiz: kısa süre sonra tekrar denenebilir */
  | 'rate_limited'
  /** Günlük istek bütçesi doldu: ertesi güne ertelenir */
  | 'budget_exceeded'
  /** Sağlayıcı geçici olarak kullanılamıyor (503, ağ) */
  | 'unavailable'
  /** Güvenlik filtresi yanıtı engelledi */
  | 'blocked'
  /** Yapılandırılmış çıktı şemaya uymadı (onarım denemesinden sonra da) */
  | 'invalid_output'
  | 'not_implemented';

export class AIError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message?: string,
    /** Tekrar denemeden önce beklenmesi önerilen süre */
    readonly retryAfterMs?: number,
  ) {
    super(message ?? code);
    this.name = 'AIError';
  }

  /** Kuyruk işinin yeniden denenmesi anlamlı mı? */
  get retryable(): boolean {
    return this.code === 'rate_limited' || this.code === 'unavailable';
  }
}
