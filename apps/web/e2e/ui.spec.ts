import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, expectNoHorizontalOverflow } from './helpers';

test.describe('erişilebilirlik (axe, WCAG 2.1 AA)', () => {
  for (const path of ['/dev/ui', '/en', '/en/login', '/de/signup', '/tr/forgot-password', '/fr/reset-password']) {
    test(`${path} ihlal içermez`, async ({ page }) => {
      await page.goto(path);
      await expectNoA11yViolations(page);
    });
  }

  test('bildirimler (toast) açık ve koyu temada ihlal içermez', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/dev/ui');
      await page.getByRole('region', { name: 'Light theme' }).getByRole('button', { name: 'Show notification' }).click();
      const toast = page.locator('[data-sonner-toast]').first();
      await expect(toast).toBeVisible();
      await expect(toast).toHaveAttribute('data-mounted', 'true');
      await page.waitForTimeout(500);
      await expectNoA11yViolations(page, { includeToasts: true });
    }
  });

  test('/dev/ui koyu sistem temasında da ihlal içermez', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/dev/ui');
    await expectNoA11yViolations(page);
  });
});

test('/dev/ui tüm bileşenleri açık ve koyu temada gösterir', async ({ page }) => {
  await page.goto('/dev/ui');
  for (const theme of ['Light theme', 'Dark theme']) {
    const panel = page.getByRole('region', { name: theme });
    await expect(panel).toBeVisible();
    for (const status of ['Planned', 'In progress', 'Waiting for your approval', 'Ready to publish', 'Published', 'Needs attention']) {
      await expect(panel.getByText(status, { exact: true }).first()).toBeVisible();
    }
    await expect(panel.getByRole('table')).toBeVisible();
    await expect(panel.getByRole('progressbar')).toBeVisible();
  }
});

test('dil değiştirici URL’i ve metinleri değiştirir, seçim saklanır', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'Deutsch' }).click();
  await expect(page).toHaveURL(/\/de\/login$/);
  await expect(page.getByRole('heading', { name: 'Willkommen zurück' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');

  // Kök adres kayıtlı dile yönlendirir
  await page.goto('/');
  await expect(page).toHaveURL(/\/de$/);
});

test('tema değiştirici anında uygular ve yenilemede korur', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('combobox', { name: 'Appearance' }).click();
  await page.getByRole('option', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('combobox', { name: 'Appearance' }).click();
  await page.getByRole('option', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test.describe('mobil 375 px, Almanca (taşma testi)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of ['/de', '/de/signup', '/de/login', '/dev/ui']) {
    test(`${path} yatay taşma yok`, async ({ page }, info) => {
      await page.goto(path);
      if (path === '/dev/ui') {
        await page.getByRole('combobox', { name: 'Language' }).first().click();
        await page.getByRole('option', { name: 'Deutsch' }).click();
        await expect(page.getByRole('heading', { name: 'Komponentenübersicht' })).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath('screenshot.png'), fullPage: true });
    });
  }
});

test('yasal sayfalar: alt bilgiden açılır, satıcı bilgisi yer tutucusu görünür, diğer dillerde İngilizce sürüm', async ({ page }) => {
  await page.goto('/tr');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Mesafeli Satış Sözleşmesi' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mesafeli Satış Sözleşmesi' })).toBeVisible();
  // .env'de LEGAL_* yoksa eksik bilgi köşeli parantezle görünür (canlıda doldurulmalı)
  await expect(page.getByText('[Şirket unvanı]').first()).toBeVisible();
  await page.getByRole('navigation', { name: 'Yasal belgeler' }).getByRole('link', { name: 'İptal, İade ve Teslimat' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'İade' })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto('/de/legal/privacy');
  await expect(page.getByText('Sie sehen die englische Fassung.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);

  expect((await page.goto('/tr/legal/yok'))?.status()).toBe(404);
  await page.goto('/tr/pricing');
  await expect(page.getByRole('heading', { level: 1, name: 'Sade fiyatlar, kredi hesabı yok' })).toBeVisible();
  await page.goto('/tr/contact');
  await expect(page.getByRole('heading', { level: 1, name: 'İletişim' })).toBeVisible();
  await expectNoA11yViolations(page);
});
