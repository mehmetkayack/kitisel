import { AsyncLocalStorage } from 'node:async_hooks';
import { Op } from 'sequelize';
import type { ModelStatic, Model } from 'sequelize';

/**
 * Kiracılar arası veri sızıntısına karşı ikinci savunma hattı (Bölüm 4.3).
 *
 * Birinci hat: repository metotları `orgId` parametresi alır ve sorguya ekler.
 * İkinci hat (bu dosya): kiracıya bağlı modellerde `where` içinde kapsam anahtarı
 * (ör. `organizationId`) yoksa sorgu çalışmadan hata fırlatılır.
 *
 * Kapsam anahtarı `where` nesnesinin en üst seviyesinde olmalıdır.
 * Bilinçli olarak tüm kiracılarda çalışan işler (admin, raporlama, migration) için
 * `withoutTenantGuard(() => ...)` kullanılır.
 */
const bypass = new AsyncLocalStorage<boolean>();

export class TenantGuardError extends Error {
  constructor(model: string, keys: readonly string[]) {
    super(`Tenant guard: ${model} sorgusunda ${keys.join(' veya ')} filtresi zorunludur`);
    this.name = 'TenantGuardError';
  }
}

export function withoutTenantGuard<T>(fn: () => Promise<T>): Promise<T> {
  return bypass.run(true, fn);
}

interface WithWhere {
  where?: unknown;
}

/**
 * Kapsam anahtarı en üst seviyede ya da bir `Op.and` içinde olmalı. Sequelize paranoid modellerde
 * update/destroy sırasında `where`'i `{ [Op.and]: [where, { deletedAt: null }] }` biçimine sarar.
 * `Op.or` içindeki anahtar sayılmaz: diğer dal tüm kiracılara açılabilir.
 */
function hasScopeKey(where: unknown, keys: readonly string[], depth = 0): boolean {
  if (!where || typeof where !== 'object' || depth > 4) return false;
  if (Array.isArray(where)) return where.some((w) => hasScopeKey(w, keys, depth + 1));
  const record = where as Record<string | symbol, unknown>;
  if (keys.some((k) => record[k] !== undefined && record[k] !== null)) return true;
  return hasScopeKey(record[Op.and], keys, depth + 1);
}

export function applyTenantGuard<M extends Model>(
  model: ModelStatic<M>,
  scopeKeys: readonly string[],
): void {
  // `destroy` hook'lardan önce öznitelik adlarını sütun adlarına çevirir (organizationId → organization_id).
  const keys = [
    ...new Set(scopeKeys.flatMap((k) => [k, (model.getAttributes() as Record<string, { field?: string }>)[k]?.field ?? k])),
  ];
  const check = (options: WithWhere) => {
    if (bypass.getStore()) return;
    if (!hasScopeKey(options.where, keys)) throw new TenantGuardError(model.name, scopeKeys);
  };
  model.addHook('beforeFind', check);
  model.addHook('beforeCount', check);
  model.addHook('beforeBulkUpdate', check);
  model.addHook('beforeBulkDestroy', check);
}
