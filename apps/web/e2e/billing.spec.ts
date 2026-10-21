import { expect, request, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BASE_URL } from './env';
import { expectNoA11yViolations, expectNoHorizontalOverflow, uniqueEmail } from './helpers';

/**
 * Ödeme sayfası. E2E API'sinde kart (PayTR) kapalı, havale açık (sadece USD hesabı: TCMB'ye istek yok);
 * bkz. playwright.config.ts. Kartla ödeme PayTR'nin gerçek sayfasını açtığı için API testlerinde sahte PayTR ile denenir.
 */
const ADMIN = { email: 'admin@upvine.local', password: 'admin-password-123' };

async function signupViaApi(locale: string): Promise<{ email: string; password: string }> {
  const email = uniqueEmail('billing');
  const password = 'a-long-test-password';
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/v1/auth/signup', { data: { name: 'Ayşe Yılmaz', email, password, locale } });
  expect(res.status()).toBe(201);
  await ctx.dispose();
  return { email, password };
}

/** Admin'in profil dilini API üzerinden ayarlar (panel profil dilinde açılır) */
async function setAdminLocale(locale: string) {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/v1/auth/login', { data: ADMIN });
  const { accessToken } = (await res.json()) as { accessToken: string };
  await ctx.patch('/api/v1/me', { data: { locale }, headers: { authorization: `Bearer ${accessToken}` } });
  await ctx.dispose();
}

async function login(page: Page, locale: 'en' | 'de', email: string, password: string) {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(locale === 'de' ? 'E-Mail' : 'Email').fill(email);
  await page.getByLabel(locale === 'de' ? 'Passwort' : 'Password').fill(password);
  await page.getByRole('button', { name: locale === 'de' ? 'Anmelden' : 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test('havale/EFT: müşteri sipariş verir, admin onaylar, paket açılır', async ({ page, browser }) => {
  const user = await signupViaApi('en');
  await login(page, 'en', user.email, user.password);

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Plan and billing' }).click();
  await expect(page.getByRole('heading', { name: 'Plan and billing', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You’re on the trial' })).toBeVisible();

  await page.getByText('Growth', { exact: true }).click();
  await page.getByLabel('Full name').fill('Ayşe Yılmaz');
  await page.getByLabel('Phone').fill('+90 532 000 00 00');
  await page.getByRole('combobox', { name: 'Country' }).click();
  await page.getByRole('option', { name: 'Turkey' }).or(page.getByRole('option', { name: 'Türkiye' })).click();
  await page.getByLabel('Billing address').fill('Moda Cad. No 1, Kadıköy, İstanbul');
  // Türkiye: $79 + %20 KDV
  await expect(page.getByText('$94.80').first()).toBeVisible();

  // Sözleşme onayı olmadan gönderilmez
  await page.getByRole('button', { name: 'Show transfer details' }).click();
  await expect(page.getByText('Please accept the agreement and the pre-information form to continue.')).toBeVisible();
  await page.getByRole('checkbox').check();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Show transfer details' }).click();

  const pending = page.getByRole('heading', { name: 'Waiting for your bank transfer' });
  await expect(pending).toBeVisible();
  const reference = (await page.getByText(/^KT[A-Z2-9]{10}$/).first().textContent())!;
  await expect(page.getByText('TR00 0000 0000 0000 0000 0000 01')).toBeVisible();
  await expectNoA11yViolations(page);

  // Admin: Ödemeler → sipariş → onay
  await setAdminLocale('en');
  // axe ayrı bağlam ister (browser.newPage değil)
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, 'en', ADMIN.email, ADMIN.password);
  await adminPage.goto('/admin/billing');
  await expect(adminPage.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();
  await adminPage.getByRole('link', { name: reference }).click();
  await expect(adminPage.getByRole('heading', { name: reference, level: 1 })).toBeVisible();
  await expectNoA11yViolations(adminPage);
  await adminPage.getByLabel('Note (optional)').fill('e2e');
  await adminPage.getByRole('button', { name: 'Payment received, open plan' }).click();
  await expect(adminPage.getByText('Payment approved, plan opened.')).toBeVisible();
  await adminContext.close();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your plan: Growth' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Renew your plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Payment history' })).toBeVisible();
});

test.describe('ödeme sayfası: 375 px, Almanca', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('yatay taşma ve erişilebilirlik ihlali yok', async ({ page }, info) => {
    const user = await signupViaApi('de');
    await login(page, 'de', user.email, user.password);
    await page.goto('/app/billing');
    await expect(page.getByRole('heading', { name: 'Paket und Zahlung', level: 1 })).toBeVisible();
    await page.getByRole('radio', { name: /Firma/ }).check({ force: true });
    await expect(page.getByLabel('Firmenname')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoA11yViolations(page);
    await page.screenshot({ path: info.outputPath('billing-de-375.png'), fullPage: true });
  });
});
