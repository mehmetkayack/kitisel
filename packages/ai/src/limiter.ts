import { AIError } from './types';

/** ioredis'in kullandığımız alt kümesi (paketi ioredis'e bağlamamak için). */
export interface CounterStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface LimiterOptions {
  /** Dakika başına istek (proje geneli, tüm süreçler) */
  rpm?: number;
  /** Günlük istek bütçesi (UTC günü) */
  dailyBudget?: number;
  /** Süreç içinde aynı anda en fazla bu kadar çağrı */
  maxConcurrency: number;
  /** RPM dolduğunda en fazla bu kadar beklenir, sonra `rate_limited` */
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Dağıtık hız sınırlayıcı (Bölüm 9, free tier): Redis'te dakikalık pencere sayacı + günlük bütçe.
 * API ve worker aynı sayaçları paylaşır. Redis yoksa sadece süreç içi eşzamanlılık sınırı uygulanır.
 */
export class AIRateLimiter {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly store: CounterStore | null,
    private readonly opts: LimiterOptions,
  ) {}

  /** Çağrı izni alır; dönen fonksiyon eşzamanlılık yuvasını bırakır. */
  async acquire(): Promise<() => void> {
    await this.takeSlot();
    try {
      await this.checkQuota();
    } catch (err) {
      this.release();
      throw err;
    }
    return () => this.release();
  }

  private async takeSlot(): Promise<void> {
    if (this.active < this.opts.maxConcurrency) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }

  private async checkQuota(): Promise<void> {
    const store = this.store;
    if (!store) return;
    const now = this.opts.now ?? Date.now;
    const sleep = this.opts.sleep ?? defaultSleep;

    if (this.opts.dailyBudget) {
      const day = new Date(now()).toISOString().slice(0, 10);
      const key = `ai:budget:${day}`;
      const used = await store.incr(key);
      if (used === 1) await store.expire(key, 2 * 86_400);
      if (used > this.opts.dailyBudget) {
        const nextDay = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
        throw new AIError('budget_exceeded', 'Günlük yapay zekâ bütçesi doldu', nextDay - now());
      }
    }

    if (this.opts.rpm) {
      const deadline = now() + (this.opts.maxWaitMs ?? 65_000);
      for (;;) {
        const minute = Math.floor(now() / 60_000);
        const key = `ai:rpm:${minute}`;
        const count = await store.incr(key);
        if (count === 1) await store.expire(key, 90);
        if (count <= this.opts.rpm) return;
        const wait = (minute + 1) * 60_000 - now() + 50;
        if (now() + wait > deadline) throw new AIError('rate_limited', 'Dakikalık istek limiti dolu', wait);
        await sleep(wait);
      }
    }
  }
}
