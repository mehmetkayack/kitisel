import { Router } from 'express';
import type { AppDeps } from '../../deps';

/** apps/worker ile aynı anahtar */
const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';

export interface HealthReport {
  database: 'ok' | 'down';
  redis: 'ok' | 'down' | 'disabled';
  worker: 'ok' | 'stale' | 'unknown';
}

async function probe(fn: () => Promise<unknown>): Promise<'ok' | 'down'> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return 'ok';
  } catch {
    return 'down';
  }
}

/** Veritabanı, Redis ve worker heartbeat durumu (health uç noktası ve admin paneli kullanır). */
export async function checkHealth(deps: AppDeps): Promise<HealthReport> {
  const [database, redis] = await Promise.all([
    probe(() => deps.sequelize.authenticate()),
    deps.redis ? probe(() => deps.redis!.ping()) : Promise.resolve('disabled' as const),
  ]);
  // Worker ayrı süreçtir; heartbeat'i bilgi amaçlı raporlanır, API sağlığını etkilemez.
  let worker: HealthReport['worker'] = 'unknown';
  if (deps.redis && redis === 'ok') {
    worker = (await deps.redis.get(WORKER_HEARTBEAT_KEY).catch(() => null)) ? 'ok' : 'stale';
  }
  return { database, redis, worker };
}

/** /api/health: yük dengeleyici ve izleme için. */
export function healthRoutes(deps: AppDeps): Router {
  const r = Router();
  r.get('/', async (_req, res) => {
    const report = await checkHealth(deps);
    const healthy = report.database === 'ok' && report.redis !== 'down';
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', ...report });
  });
  return r;
}
