import type { Env } from '@upvine/config/env';
import { AIRateLimiter } from './limiter';
import type { CounterStore } from './limiter';
import { UnconfiguredAIProvider } from './providers/fake';
import { GeminiProvider } from './providers/gemini';
import type { ModelPrice } from './providers/gemini';
import type { AIProvider, AIUsageEvent } from './types';

export interface CreateAIProviderOptions {
  /** Dağıtık RPM ve günlük bütçe sayaçları (yoksa sadece süreç içi eşzamanlılık sınırı) */
  store: CounterStore | null;
  onUsage?: (event: AIUsageEvent) => void;
}

function parsePricing(raw: string | undefined): Record<string, ModelPrice> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, ModelPrice>;
  } catch {
    return undefined;
  }
}

/**
 * `AI_PROVIDER` değerine göre sağlayıcı. Anahtar yoksa çökmez: `configured: false` olan bir
 * sağlayıcı döner ve çağıranlar yapay zekâsız yola (sezgisel analiz, elle konu ekleme) düşer.
 */
export function createAIProvider(env: Env, opts: CreateAIProviderOptions): AIProvider {
  if (!env.GEMINI_API_KEY || !(env.GEMINI_MODEL_FAST ?? env.GEMINI_MODEL_QUALITY)) return new UnconfiguredAIProvider();
  return new GeminiProvider({
    apiKey: env.GEMINI_API_KEY,
    models: {
      fast: env.GEMINI_MODEL_FAST,
      quality: env.GEMINI_MODEL_QUALITY,
      reasoning: env.GEMINI_MODEL_REASONING,
      embedding: env.GEMINI_MODEL_EMBEDDING,
      image: env.GEMINI_MODEL_IMAGE,
    },
    limiter: new AIRateLimiter(opts.store, {
      rpm: env.AI_RPM_LIMIT,
      dailyBudget: env.AI_DAILY_REQUEST_BUDGET,
      maxConcurrency: env.AI_MAX_CONCURRENCY,
    }),
    onUsage: opts.onUsage,
    pricing: parsePricing(env.AI_PRICING_JSON),
    requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  });
}
