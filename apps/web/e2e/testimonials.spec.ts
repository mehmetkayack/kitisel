import { expect, request, test } from '@playwright/test';
import { BASE_URL } from './env';
import { expectNoA11yViolations, expectNoHorizontalOverflow } from './helpers';

/** E2E veritabanına global-setup ile eklenen superadmin (packages/db/src/seed.ts) */
const ADMIN = { email: 'admin@upvine.local', password: 'admin-password-123' };

async function setAdminLocale(locale: string) {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/v1/auth/login', { data: ADMIN });
  const { accessToken } = (await res.json()) as { accessToken: string };
  await ctx.patch('/api/v1/me', { data: { locale }, headers: { authorization: `Bearer ${accessToken}` } });
  await ctx.dispose();
}

test('müşteri yorumu: admin ekler, worker çevirir, ana sayfada her dilde görünür', async ({ page }) => {
  const quote = `Kitisel sayesinde blogumuz düzenli yayımlanıyor, randevular arttı ${Date.now()}.`;
  await setAdminLocale('en');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/admin/testimonials');
  await expect(page.getByRole('heading', { name: 'Customer testimonials' })).toBeVisible();
  await page.getByRole('link', { name: 'New testimonial' }).click();
  await page.getByLabel('Full name').fill('Ayşe Yılmaz');
  await page.getByLabel('Title / company').fill('Kurucu, Gülüş Diş Kliniği');
  await page.getByLabel('Website').fill('gulus.example');
  await page.getByRole('textbox', { name: 'Testimonial' }).fill(quote);
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Published' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(/\/admin\/testimonials\/[0-9a-f-]{36}$/);
  // Worker (sahte yapay zekâ) çevirir; sayfa 2 sn'de bir sorgular
  await expect(page.getByText('Translated', { exact: true })).toBeVisible({ timeout: 30_000 });
  const german = page.getByRole('form', { name: 'Deutsch' });
  await expect(german.getByRole('textbox', { name: 'Testimonial' })).toHaveValue(`[de] ${quote}`);
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);

  // Ana sayfa: kaynak dil ve çeviri; dar ekranda Almanca taşmaz
  await page.goto('/tr');
  const tr = page.getByRole('region', { name: 'Müşterilerimiz ne diyor?' });
  await expect(tr.getByText(quote)).toBeVisible();
  await expect(tr.getByRole('img', { name: '5 üzerinden 5 puan' })).toBeVisible();
  await expect(tr.getByRole('link', { name: 'gulus.example' })).toHaveAttribute('href', 'https://gulus.example/');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/de');
  const de = page.getByRole('region', { name: 'Das sagen unsere Kunden' });
  await expect(de.getByText(`[de] ${quote}`)).toBeVisible();
  await expect(de.getByText('[de] Kurucu, Gülüş Diş Kliniği')).toBeVisible();
  await de.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);
});
