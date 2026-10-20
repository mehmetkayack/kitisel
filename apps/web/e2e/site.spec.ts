import { expect, request, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BASE_URL } from './env';
import { expectNoA11yViolations, expectNoHorizontalOverflow } from './helpers';

/** E2E veritabanına global-setup ile eklenen superadmin (packages/db/src/seed.ts) */
const ADMIN = { email: 'admin@upvine.local', password: 'admin-password-123' };

async function adminLogin(page: Page) {
  // Admin paneli profil dilinde açılır
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/v1/auth/login', { data: ADMIN });
  const { accessToken } = (await res.json()) as { accessToken: string };
  await ctx.patch('/api/v1/me', { data: { locale: 'en' }, headers: { authorization: `Bearer ${accessToken}` } });
  await ctx.dispose();

  await page.goto('/en/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test('iletişim formu: doğrulama, gönderim ve admin panelinde mesaj', async ({ page }) => {
  const sender = `Contact Person ${Date.now()}`;
  await page.goto('/en/contact');
  await expect(page.getByRole('heading', { name: 'Contact', level: 1 })).toBeVisible();
  // Adres kartı (satıcı bilgisi testte boş: yer tutucu)
  await expect(page.getByText('Address', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('This is too short. Please add a little more.').first()).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByLabel('Full name').fill(sender);
  await page.getByLabel('Email').fill('contact@example.com');
  await page.getByLabel('Phone').fill('abc');
  await page.getByLabel('Your message').fill('I would like to learn more about the Agency plan.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText(/valid phone number/)).toBeVisible();
  await page.getByLabel('Phone').fill('');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('We’ve received your message')).toBeVisible();

  await adminLogin(page);
  await page.goto('/admin/messages');
  await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: sender }).click();
  await expect(page.getByRole('heading', { name: sender, level: 1 })).toBeVisible();
  await expect(page.getByText('I would like to learn more about the Agency plan.')).toBeVisible();
  await expect(page.getByText('Read', { exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('blog: admin yazıyı yayımlar, sitede listelenir ve açılır', async ({ page }) => {
  const title = `Local SEO checklist ${Date.now()}`;
  await adminLogin(page);
  await page.goto('/admin/blog');
  await page.getByRole('link', { name: 'New post' }).click();
  await expect(page).toHaveURL(/\/admin\/blog\/new$/);

  await page.getByLabel('Title', { exact: true }).fill(title);
  // Adres başlıktan üretilir
  await expect(page.getByLabel('Address')).toHaveValue(/^local-seo-checklist-\d+$/);
  await page.getByLabel('Short summary').fill('A short checklist to help small businesses show up in local search.');
  await page.getByRole('textbox', { name: 'Post' }).click();
  await page.keyboard.type('Start with your business profile and make sure your address is consistent everywhere.');
  await page.getByRole('main').getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Published' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Post saved and published.')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]{36}$/);
  await expectNoA11yViolations(page);

  await page.goto('/en/blog');
  await expect(page.getByRole('heading', { name: 'Practical notes for getting found in search', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Start with your business profile')).toBeVisible();
  await expect(page).toHaveTitle(`${title} · Kitisel`);
  await expectNoA11yViolations(page);

  // Diğer dilde listelenmez; Almanca ve dar ekranda taşma yok
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/de/blog');
  await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.goto('/de/contact');
  await expectNoHorizontalOverflow(page);
});
