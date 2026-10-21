import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Op } from 'sequelize';
import {
  AiVisibilityCheck,
  AiVisibilityPrompt,
  GscConnection,
  GscDailyMetric,
  ArticleRewrite,
  ArticleVersion,
  BillingOrder,
  ContentRefresh,
  Membership,
  Site,
  sitesRepository,
  membershipsRepository,
  organizationsRepository,
  TenantGuardError,
  usersRepository,
  withoutTenantGuard,
} from '@upvine/db';
import { createTestContext } from './helpers';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function seedTwoTenants() {
  const [alice, bob] = await Promise.all([
    usersRepository.create({ email: 'alice@a.com', name: 'Alice', passwordHash: null, locale: 'en' }),
    usersRepository.create({ email: 'bob@b.com', name: 'Bob', passwordHash: null, locale: 'en' }),
  ]);
  const [orgA, orgB] = await Promise.all([
    organizationsRepository.create({ name: 'A', slug: 'a-1', defaultLocale: 'en' }),
    organizationsRepository.create({ name: 'B', slug: 'b-1', defaultLocale: 'en' }),
  ]);
  await membershipsRepository.create({ orgId: orgA.id, userId: alice.id, role: 'owner' });
  await membershipsRepository.create({ orgId: orgB.id, userId: bob.id, role: 'owner' });
  return { alice, bob, orgA, orgB };
}

describe('kiracı izolasyonu', () => {
  it('organizasyon filtresi olmayan sorgu çalışmadan reddedilir', async () => {
    await seedTwoTenants();
    await expect(Membership.findAll()).rejects.toBeInstanceOf(TenantGuardError);
    await expect(Membership.count()).rejects.toBeInstanceOf(TenantGuardError);
    await expect(Membership.destroy({ where: {} })).rejects.toBeInstanceOf(TenantGuardError);
    // Editör tabloları (sürüm geçmişi, bölüm yeniden yazımı)
    await expect(ArticleVersion.findAll({ where: { articleId: 'x' } })).rejects.toBeInstanceOf(TenantGuardError);
    await expect(ArticleRewrite.findOne({ where: { id: 'x' } })).rejects.toBeInstanceOf(TenantGuardError);
    // Sonuçlar tabloları (Search Console, AI görünürlük)
    await expect(GscConnection.findOne({ where: { siteId: 'x' } })).rejects.toBeInstanceOf(TenantGuardError);
    await expect(GscDailyMetric.findAll({ where: { siteId: 'x' } })).rejects.toBeInstanceOf(TenantGuardError);
    await expect(AiVisibilityPrompt.destroy({ where: { siteId: 'x' } })).rejects.toBeInstanceOf(TenantGuardError);
    await expect(AiVisibilityCheck.findAll({ where: { promptId: 'x' } })).rejects.toBeInstanceOf(TenantGuardError);
    // İçerik yenileme önerileri
    await expect(ContentRefresh.findAll({ where: { siteId: 'x' } })).rejects.toBeInstanceOf(TenantGuardError);
    // Ödeme siparişleri (PayTR bildirimi ve admin listesi sadece withoutTenantGuard ile)
    await expect(BillingOrder.findOne({ where: { reference: 'KTX' } })).rejects.toBeInstanceOf(TenantGuardError);
  });

  it('repository sadece istenen organizasyonun verisini döner', async () => {
    const { orgA, orgB, alice, bob } = await seedTwoTenants();
    const a = await membershipsRepository.listForOrg(orgA.id);
    expect(a.map((m) => m.userId)).toEqual([alice.id]);
    expect(await membershipsRepository.find(orgA.id, bob.id)).toBeNull();
    expect((await membershipsRepository.listForOrg(orgB.id)).map((m) => m.userId)).toEqual([bob.id]);
  });

  it('bilinçli tüm-kiracı sorguları sadece withoutTenantGuard ile yapılabilir', async () => {
    await seedTwoTenants();
    const all = await withoutTenantGuard(() => Membership.findAll());
    expect(all).toHaveLength(2);
  });

  it('soft-delete (paranoid) modelde güncelleme ve silme kapsamlı çalışır, kapsamsız olan reddedilir', async () => {
    const { orgA, orgB } = await seedTwoTenants();
    const site = await sitesRepository.create(orgA.id, { url: 'https://a.com/', domain: 'a.com', name: 'a.com', timezone: 'UTC' });
    await sitesRepository.update(orgA.id, site.id, { name: 'A sitesi' });
    expect((await sitesRepository.findById(orgA.id, site.id))?.name).toBe('A sitesi');
    expect(await sitesRepository.findById(orgB.id, site.id)).toBeNull();

    await expect(Site.update({ name: 'x' }, { where: { id: site.id } })).rejects.toBeInstanceOf(TenantGuardError);
    await expect(Site.destroy({ where: { id: site.id } })).rejects.toBeInstanceOf(TenantGuardError);
    // Op.or içindeki kapsam anahtarı sayılmaz: diğer dal tüm kiracılara açılır.
    await expect(Site.findAll({ where: { [Op.or]: [{ organizationId: orgA.id }, { name: 'x' }] } })).rejects.toBeInstanceOf(TenantGuardError);

    await sitesRepository.softDelete(orgB.id, site.id);
    expect(await sitesRepository.findById(orgA.id, site.id)).not.toBeNull();
    await sitesRepository.softDelete(orgA.id, site.id);
    expect(await sitesRepository.findById(orgA.id, site.id)).toBeNull();
  });
});
