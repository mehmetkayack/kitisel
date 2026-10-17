import { expect, request, test } from '@playwright/test';
import { BASE_URL } from './env';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, expectNoHorizontalOverflow, uniqueEmail } from './helpers';

/** E2E veritabanına global-setup ile eklenen superadmin (packages/db/src/seed.ts) */
const ADMIN = { email: 'admin@upvine.local', password: 'admin-password-123' };

async function login(page: Page, email: string, password: string) {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

/** Admin'in profil dilini API üzerinden ayarlar (panel her açılışta profil dilini kullanır). */
async function setAdminLocale(locale: string) {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/v1/auth/login', { data: ADMIN });
  const { accessToken } = (await res.json()) as { accessToken: string };
  await ctx.patch('/api/v1/me', { data: { locale }, headers: { authorization: `Bearer ${accessToken}` } });
  await ctx.dispose();
}

test('admin paneli: genel bakış, kullanıcı arama, detay ve kullanıcının gözünden görüntüleme', async ({ page, browser }) => {
  // Görüntülenecek normal kullanıcı (ayrı tarayıcı bağlamında kayıt)
  const email = uniqueEmail('viewed');
  const other = await browser.newPage();
  await other.goto('/en/signup');
  await other.getByLabel('Your name').fill('Viewed Person');
  await other.getByLabel('Email').fill(email);
  await other.getByLabel('Password').fill('a-long-test-password');
  await other.getByRole('button', { name: 'Create account' }).click();
  await expect(other).toHaveURL(/\/app$/);
  await other.close();

  await setAdminLocale('en');
  await login(page, ADMIN.email, ADMIN.password);

  // Kullanıcı menüsünden admin paneline
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Admin panel' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  await expect(page.getByText('Working').first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Kullanıcılar: arama ve detay
  await page.getByRole('navigation', { name: 'Admin menu' }).getByRole('link', { name: 'Users' }).click();
  await page.getByLabel('Search').fill(email);
  await page.getByRole('link', { name: `Viewed Person ${email}` }).click();
  await expect(page.getByRole('heading', { name: 'Viewed Person', level: 1 })).toBeVisible();
  await expect(page.getByText('Email not confirmed')).toBeVisible();
  await expectNoA11yViolations(page);

  // Kullanıcının gözünden görüntüleme: panel onun verisiyle açılır, salt okunur şerit görünür
  await page.getByRole('button', { name: 'View as this user' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Viewed Person' })).toBeVisible();
  await expect(page.getByText(`You are viewing Upvine as Viewed Person (${email})`)).toBeVisible();

  // Çıkış: admin oturumuna ve kullanıcının admin detayına dönülür
  await page.getByRole('button', { name: 'Exit view' }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Viewed Person', level: 1 })).toBeVisible();

  // İşlem denetim kaydında
  await page.getByRole('navigation', { name: 'Admin menu' }).getByRole('link', { name: 'Audit log' }).click();
  await page.getByLabel('Filter by action').fill('impersonation');
  await expect(page.getByText('admin.impersonation_started').first()).toBeVisible();
});

test('admin: ödemesiz hesaba tam yetki verir (paket ve haklar)', async ({ page }) => {
  // Paketsiz yeni kullanıcı (API ile kayıt, organizasyon kimliği yanıttan)
  const api = await request.newContext({ baseURL: BASE_URL });
  const res = await api.post('/api/v1/auth/signup', { data: { email: uniqueEmail('comp'), name: 'Comp Owner', password: 'a-long-test-password' } });
  const { user } = (await res.json()) as { user: { organizations: { id: string }[] } };
  await api.dispose();

  await setAdminLocale('en');
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto(`/admin/organizations/${user.organizations[0]!.id}`);
  await expect(page.getByRole('heading', { name: 'Plan and entitlements' })).toBeVisible();
  await expect(page.getByText('Current plan: Trial (no plan)')).toBeVisible();
  await page.getByRole('button', { name: 'Grant full access' }).click();
  await page.getByLabel('Note').fill('Pilot customer');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Save entitlements' }).click();
  await expect(page.getByText('Entitlements updated.')).toBeVisible();
  await expect(page.getByText('Current plan: Agency')).toBeVisible();
  await expect(page.getByText('Complimentary').first()).toBeVisible();
  await expect(page.getByText(/This month 0 \/ 100 articles/)).toBeVisible();
});

test('superadmin olmayan kullanıcı admin panelini göremez', async ({ page }) => {
  const email = uniqueEmail('nonadmin');
  await page.goto('/en/signup');
  await page.getByLabel('Your name').fill('Regular');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-long-test-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: "We can't find this page" })).toBeVisible();
});

test.describe('admin mobil 375 px, Almanca', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('menü açılır ve sayfalar taşmaz', async ({ page }) => {
    await setAdminLocale('de');
    await login(page, ADMIN.email, ADMIN.password);
    for (const path of ['/admin', '/admin/users', '/admin/audit']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalOverflow(page);
    }
    await page.getByRole('button', { name: 'Menü' }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Nutzer' })).toBeVisible();
  });
});
