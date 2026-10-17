import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, expectNoHorizontalOverflow, uniqueEmail } from './helpers';

/**
 * Kurulum sihirbazı uçtan uca (Bölüm 7.1): site ekleme → arka planda analiz (worker) → marka profili →
 * dil → ton → ilk konular → CMS (atla) → yayın → ana sayfa, takvim ve site sağlığı raporu.
 * Worker e2e'de sahte site (`*.example`) ve sahte yapay zekâ ile çalışır (E2E_FAKE_EXTERNALS).
 */
async function signup(page: Page): Promise<void> {
  await page.goto('/en/signup');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel('Your name').fill('Wizard Tester');
  await page.getByLabel('Email').fill(uniqueEmail('wizard'));
  await page.getByLabel('Password').fill('a-long-test-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test('kurulum sihirbazı: site eklenir, analiz edilir, konular planlanır', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);

  // Ana sayfadaki kurulum listesinden sihirbaza
  await page.getByRole('link', { name: 'Start setup' }).click();
  await expect(page.getByRole('heading', { name: 'Which website should we grow?' })).toBeVisible();
  await expectNoA11yViolations(page);

  // 1. Adres: geçersiz adres alan hatası verir
  await page.getByLabel('Website address').fill('localhost');
  await page.getByRole('button', { name: 'Analyze my site' }).click();
  await expect(page.getByText('Please enter your website address, like example.com.')).toBeVisible();
  await page.getByLabel('Website address').fill('klinik.example');
  await page.getByRole('button', { name: 'Analyze my site' }).click();

  // 2. Analiz (worker) → marka profili
  await expect(page.getByRole('heading', { name: 'Is this your business?' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel('Business or brand name')).toHaveValue('Gülüş Diş Kliniği');
  await expect(page.getByText('Site health score')).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByLabel('Industry').fill('Diş kliniği');
  await page.getByRole('button', { name: 'Looks right, continue' }).click();

  // 3. Dil ve ülke: siteden önerilen Türkçe
  await expect(page.getByRole('heading', { name: 'Where are your customers?' })).toBeVisible();
  await expect(page.getByLabel('Article language')).toContainText('Türkçe');
  await expect(page.getByLabel('Main country')).toContainText('Türkiye');
  await page.getByRole('button', { name: 'Continue' }).click();

  // 4. Ses tonu: yapay zekânın önerdiği "Friendly" seçili gelir
  await expect(page.getByRole('heading', { name: 'How should your articles sound?' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Friendly/ })).toBeChecked();
  await expectNoA11yViolations(page);
  await page.getByText('Expert and technical').click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 5. Konular: otomatik öneri, mevcut sayfayla aynı konu elenmiş
  await expect(page.getByRole('heading', { name: 'Your first topics' })).toBeVisible();
  const topics = page.getByRole('list', { name: 'Your first topics' });
  await expect(topics.getByRole('listitem')).toHaveCount(3, { timeout: 30_000 });
  await expect(topics.getByText('İmplant tedavisi kaç seans sürer?')).toBeVisible();
  await expect(topics.getByText('Estimate').first()).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Remove: Diş beyazlatma zararlı mı? Bilmeniz gerekenler' }).click();
  await expect(topics.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Article title').fill('Diş taşı temizliği ne sıklıkla yapılmalı?');
  await page.getByLabel('Main search phrase').fill('diş taşı temizliği');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await expect(topics.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('Selected topics: 3')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 6. CMS: şimdilik atla
  await expect(page.getByRole('heading', { name: 'Site connection' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /WordPress/ })).toBeChecked();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  // 7. Yayın: approval modu, günler, saat
  await expect(page.getByRole('heading', { name: 'When should we publish?' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /I approve each article/ })).toBeChecked();
  await page.getByRole('button', { name: 'Fri', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fri', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Finish setup' }).click();

  // Ana sayfa: durum şeridi, site sağlığı ve sıradaki yazılar
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(/Setup is done\. Your first article is planned for/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next articles' })).toBeVisible();
  await expect(page.getByText('Diş taşı temizliği ne sıklıkla yapılmalı?')).toBeVisible();
  await expectNoA11yViolations(page);

  // Takvim ve içerikler
  await page.getByRole('link', { name: 'See calendar' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await expect(page.getByText('İmplant tedavisi kaç seans sürer?')).toBeVisible();
  // Kurulum biter bitmez ilk yazılar yazılmaya başlar (yazılıyor ya da onay bekliyor)
  await expect(page.getByText(/In progress|Waiting for your approval/).first()).toBeVisible();

  // Sonuçlar → site sağlığı raporu
  await page.goto('/app/results');
  // Varsayılan sekme Genel bakış; site sağlığı kendi sekmesinde
  await expect(page.getByRole('tab', { name: 'Overview', selected: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Site health' }).click();
  await expect(page.getByRole('tab', { name: 'Site health', selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Site health', level: 2 })).toBeVisible();
  await expect(page.getByText('Secure connection (HTTPS)')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Working well/ })).toBeVisible();
  await expectNoA11yViolations(page);

  // Kurulum bitince sihirbaz özet gösterir ve adımlar yeniden düzenlenebilir
  await page.goto('/app/onboarding');
  await expect(page.getByRole('heading', { name: 'Setup is complete' })).toBeVisible();
  await page.getByRole('link', { name: 'Change' }).nth(2).click();
  await expect(page.getByRole('heading', { name: 'How should your articles sound?' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Expert and technical/ })).toBeChecked();
});

test('hata veren site anlaşılır mesaj ve başka adres seçeneği gösterir (375 px, Almanca, taşma yok)', async ({ page }) => {
  // Almanca kayıt: profil dili de olur, panel baştan Almanca açılır.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/de/signup');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel('Ihr Name').fill('Wizard Tester');
  await page.getByLabel('E-Mail').fill(uniqueEmail('wizard-de'));
  await page.getByLabel('Passwort').fill('a-long-test-password');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/onboarding');
  await expect(page.getByRole('heading', { name: 'Welche Website sollen wir wachsen lassen?' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByLabel('Website-Adresse').fill('broken.example');
  await page.getByRole('button', { name: 'Meine Website analysieren' }).click();
  await expect(page.getByText('Ihre Website hat mit einem Fehler geantwortet.', { exact: false })).toBeVisible({ timeout: 45_000 });
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Andere Adresse verwenden' }).click();
  await expect(page.getByRole('heading', { name: 'Welche Website sollen wir wachsen lassen?' })).toBeVisible();
});
