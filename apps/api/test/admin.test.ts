import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { usersRepository } from '@upvine/db';
import type { AdminOrgDetail, AdminStats, AdminUserDetail, AuthResponse, ImpersonationResponse, Page, AdminUserRow, AdminAuditRow } from '@upvine/shared';
import { createTestContext } from './helpers';

const ctx = createTestContext();
const api = () => request(ctx.app);

async function signup(email: string, name: string): Promise<AuthResponse> {
  const res = await api().post('/api/v1/auth/signup').send({ email, name, password: 'long-enough-password' }).expect(201);
  return res.body as AuthResponse;
}

/** Superadmin oturumu: kayıt + yetki + yeniden giriş */
async function adminSession() {
  const admin = await signup('admin@example.com', 'Admin');
  await usersRepository.update(admin.user.id, { isSuperadmin: true });
  return { token: admin.accessToken, id: admin.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('admin yetkisi', () => {
  it('superadmin olmayan kullanıcı ve oturumsuz istek reddedilir', async () => {
    const user = await signup('user@example.com', 'User');
    await api().get('/api/v1/admin/stats').expect(401);
    const res = await api().get('/api/v1/admin/stats').set(auth(user.accessToken)).expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('yetki her istekte veritabanından okunur: geri alınan yetki hemen geçersizdir', async () => {
    const admin = await adminSession();
    await api().get('/api/v1/admin/stats').set(auth(admin.token)).expect(200);
    await usersRepository.update(admin.id, { isSuperadmin: false });
    await api().get('/api/v1/admin/stats').set(auth(admin.token)).expect(403);
  });
});

describe('admin verileri', () => {
  it('istatistikler kullanıcı, organizasyon, son 14 gün ve sistem sağlığını içerir', async () => {
    const admin = await adminSession();
    await signup('a@example.com', 'A');
    const res = await api().get('/api/v1/admin/stats').set(auth(admin.token)).expect(200);
    const stats = res.body as AdminStats;
    expect(stats.users).toMatchObject({ total: 2, superadmins: 1, newLast7Days: 2 });
    expect(stats.organizations.total).toBe(2);
    expect(stats.organizations.byPlanStatus.none).toBe(2);
    expect(stats.signupsByDay).toHaveLength(14);
    expect(stats.signupsByDay.at(-1)?.count).toBe(2);
    expect(stats.health.database).toBe('ok');
  });

  it('kullanıcı listesi en yeni önce, cursor ile sayfalanır ve aranabilir', async () => {
    const admin = await adminSession();
    for (const n of ['one', 'two', 'three']) await signup(`${n}@example.com`, n);

    const first = (await api().get('/api/v1/admin/users?limit=2').set(auth(admin.token)).expect(200)).body as Page<AdminUserRow>;
    expect(first.items.map((u) => u.email)).toEqual(['three@example.com', 'two@example.com']);
    expect(first.items[0]?.organizationCount).toBe(1);
    expect(first.nextCursor).toBeTruthy();

    const second = (await api().get(`/api/v1/admin/users?limit=2&cursor=${first.nextCursor}`).set(auth(admin.token)).expect(200))
      .body as Page<AdminUserRow>;
    expect(second.items.map((u) => u.email)).toEqual(['one@example.com', 'admin@example.com']);
    expect(second.nextCursor).toBeNull();

    // % joker karakter sayılmaz
    const search = (await api().get('/api/v1/admin/users?q=tw').set(auth(admin.token)).expect(200)).body as Page<AdminUserRow>;
    expect(search.items.map((u) => u.email)).toEqual(['two@example.com']);
    const wildcard = (await api().get('/api/v1/admin/users?q=%25').set(auth(admin.token)).expect(200)).body as Page<AdminUserRow>;
    expect(wildcard.items).toHaveLength(0);
  });

  it('organizasyon detayı üyeleri gösterir', async () => {
    const admin = await adminSession();
    const user = await signup('owner@example.com', 'Owner');
    const orgId = user.user.organizations[0]!.id;
    const res = await api().get(`/api/v1/admin/organizations/${orgId}`).set(auth(admin.token)).expect(200);
    expect(res.body.members).toEqual([expect.objectContaining({ email: 'owner@example.com', role: 'owner' })]);
    await api().get('/api/v1/admin/organizations/00000000-0000-7000-8000-000000000000').set(auth(admin.token)).expect(404);
  });
});

describe('admin işlemleri', () => {
  it('ödemesiz paket ve özel makale hakkı verilir; panelde kota ve özellikler değişir; kayda geçer', async () => {
    const admin = await adminSession();
    const user = await signup('owner@example.com', 'Owner');
    const orgId = user.user.organizations[0]!.id;
    let org = (await api().get(`/api/v1/admin/organizations/${orgId}`).set(auth(admin.token)).expect(200)).body as AdminOrgDetail;
    // Deneme hakkı (geliştirme ortamında ARTICLE_QUOTA_OVERRIDE geçerli olabilir)
    const trialLimit = ctx.env.ARTICLE_QUOTA_OVERRIDE ?? 3;
    expect(org).toMatchObject({ plan: null, planSource: 'trial', usage: { effectivePlan: null, articleLimit: trialLimit, siteLimit: 1 } });

    await api().put(`/api/v1/admin/organizations/${orgId}/entitlements`).set(auth(admin.token)).send({ plan: 'enterprise', articleQuotaOverride: null, expiresAt: null, note: null }).expect(400);
    org = (
      await api()
        .put(`/api/v1/admin/organizations/${orgId}/entitlements`)
        .set(auth(admin.token))
        .send({ plan: 'agency', articleQuotaOverride: 250, expiresAt: '2099-12-31', note: 'Pilot müşteri' })
        .expect(200)
    ).body as AdminOrgDetail;
    expect(org).toMatchObject({
      plan: 'agency',
      planStatus: 'active',
      planSource: 'complimentary',
      articleQuotaOverride: 250,
      entitlementNote: 'Pilot müşteri',
      usage: { effectivePlan: 'agency', articleLimit: 250, siteLimit: 5 },
    });
    expect(org.entitlementExpiresAt).toBe('2099-12-31T23:59:59.000Z');
    // Kullanıcının panelinde aylık hak
    const usage = (await api().get('/api/v1/content').set(auth(user.accessToken)).expect(200)).body as { usage: { limit: number } };
    expect(usage.usage.limit).toBe(250);
    const audit = (await api().get('/api/v1/admin/audit-logs?action=admin.entitlements_updated').set(auth(admin.token)).expect(200)).body as Page<AdminAuditRow>;
    expect(audit.items).toHaveLength(1);

    // Kaldırma: denemeye döner
    org = (await api().put(`/api/v1/admin/organizations/${orgId}/entitlements`).set(auth(admin.token)).send({ plan: null, articleQuotaOverride: null, expiresAt: null, note: null }).expect(200)).body as AdminOrgDetail;
    expect(org).toMatchObject({ plan: null, planStatus: 'none', planSource: 'trial', usage: { articleLimit: trialLimit } });
    // Süper admin olmayan değiştiremez
    await api().put(`/api/v1/admin/organizations/${orgId}/entitlements`).set(auth(user.accessToken)).send({ plan: 'agency', articleQuotaOverride: null, expiresAt: null, note: null }).expect(403);
  });

  it('ödemeli abonelikte paket değişmez, sadece ek hak verilir', async () => {
    const admin = await adminSession();
    const user = await signup('paid@example.com', 'Paid');
    const orgId = user.user.organizations[0]!.id;
    await ctx.sequelize.query("UPDATE organizations SET plan = 'starter', plan_status = 'active', plan_source = 'paid' WHERE id = ?", { replacements: [orgId] });
    const org = (await api().put(`/api/v1/admin/organizations/${orgId}/entitlements`).set(auth(admin.token)).send({ plan: 'agency', articleQuotaOverride: 40, expiresAt: null, note: null }).expect(200)).body as AdminOrgDetail;
    expect(org).toMatchObject({ plan: 'starter', planSource: 'paid', usage: { effectivePlan: 'starter', articleLimit: 40 } });
  });

  it('superadmin yetkisi verir; kendi yetkisini kaldıramaz; işlemler denetim kaydına yazılır', async () => {
    const admin = await adminSession();
    const user = await signup('promote@example.com', 'Promote');

    const updated = (await api()
      .patch(`/api/v1/admin/users/${user.user.id}`)
      .set(auth(admin.token))
      .send({ isSuperadmin: true, emailVerified: true })
      .expect(200)).body as AdminUserDetail;
    expect(updated).toMatchObject({ isSuperadmin: true, emailVerified: true });

    const self = await api().patch(`/api/v1/admin/users/${admin.id}`).set(auth(admin.token)).send({ isSuperadmin: false }).expect(400);
    expect(self.body.error.code).toBe('cannot_change_own_admin');

    const audit = (await api().get('/api/v1/admin/audit-logs?action=admin.').set(auth(admin.token)).expect(200)).body as Page<AdminAuditRow>;
    expect(audit.items[0]).toMatchObject({ action: 'admin.user_updated', userEmail: 'admin@example.com', targetId: user.user.id });
  });

  it('oturumları kapatma kullanıcının refresh token’larını iptal eder', async () => {
    const admin = await adminSession();
    const user = await signup('kick@example.com', 'Kick');
    const before = (await api().get(`/api/v1/admin/users/${user.user.id}`).set(auth(admin.token))).body as AdminUserDetail;
    expect(before.activeSessions).toBe(1);
    await api().post(`/api/v1/admin/users/${user.user.id}/revoke-sessions`).set(auth(admin.token)).expect(204);
    const after = (await api().get(`/api/v1/admin/users/${user.user.id}`).set(auth(admin.token))).body as AdminUserDetail;
    expect(after.activeSessions).toBe(0);
  });

  it('kullanıcının gözünden görüntüleme: okuma serbest, değişiklik ve admin uç noktaları kapalı, kayda geçer', async () => {
    const admin = await adminSession();
    const user = await signup('viewed@example.com', 'Viewed');

    const imp = (await api().post(`/api/v1/admin/users/${user.user.id}/impersonate`).set(auth(admin.token)).expect(200))
      .body as ImpersonationResponse;
    expect(imp.user.email).toBe('viewed@example.com');

    const me = await api().get('/api/v1/me').set(auth(imp.accessToken)).expect(200);
    expect(me.body.email).toBe('viewed@example.com');

    const write = await api().patch('/api/v1/me').set(auth(imp.accessToken)).send({ name: 'Hacked' }).expect(403);
    expect(write.body.error.code).toBe('impersonation_read_only');
    // Görüntüleme token'ıyla admin paneline erişilemez (hedef admin olsa bile)
    await api().get('/api/v1/admin/stats').set(auth(imp.accessToken)).expect(403);

    const audit = (await api().get('/api/v1/admin/audit-logs?action=impersonation').set(auth(admin.token))).body as Page<AdminAuditRow>;
    expect(audit.items[0]).toMatchObject({ action: 'admin.impersonation_started', targetId: user.user.id });
  });
});
