import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, expectNoHorizontalOverflow, uniqueEmail, waitForEmail } from './helpers';
import { FIXTURE_IMAGE_PNG } from '@upvine/seo/testing';

/** 1×1 PNG: kapak için çok küçük */
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Ücretsiz analiz (Bölüm 7.2) ve içerik → inceleme → onay → yayın hattı (Bölüm 7.6, 7.8).
 * Worker sahte site, sahte yapay zekâ ve sahte yayın hedefleriyle çalışır (E2E_FAKE_EXTERNALS).
 */

test('ücretsiz analiz: ana sayfadan rapora, e-posta ve kayıt çağrısı', async ({ page }) => {
  // Analiz formu doğrudan ana sayfanın hero'sunda (kayıt gerekmez)
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How it compares' })).toBeVisible();
  await expect(page.getByText('Most popular')).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByLabel('Website address').fill('analiz.example');
  await page.getByRole('button', { name: 'Analyze my site for free' }).click();

  await expect(page).toHaveURL(/\/en\/free-analysis\/r\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: 'SEO analysis for analiz.example', level: 1 })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'Top keyword opportunities' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'implant tedavisi süresi' })).toBeVisible();
  await expect(page.getByText('Rakip Klinik')).toBeVisible();
  await expect(page.getByText('Secure connection (HTTPS)')).toBeVisible();
  await expectNoA11yViolations(page);

  const email = uniqueEmail('report');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send the report' }).click();
  await expect(page.getByText(`We sent the report to ${email}.`)).toBeVisible();
  expect(await waitForEmail(email, 'analiz.example')).toContain('/en/free-analysis/r/');

  await page.getByRole('link', { name: /Apply this plan automatically/ }).click();
  await expect(page).toHaveURL(/\/en\/signup$/);
});

test('ücretsiz analiz raporu 375 px Almancada taşmaz', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/de/free-analysis');
  await page.getByLabel('Website-Adresse').fill('mobil.example');
  await page.getByRole('button', { name: 'Meine Website kostenlos analysieren' }).click();
  await expect(page.getByRole('heading', { name: 'SEO-Analyse für mobil.example', level: 1 })).toBeVisible({ timeout: 45_000 });
  await expectNoHorizontalOverflow(page);
});

async function connectWebhook(page: Page): Promise<void> {
  await page.getByText('Webhook (custom website)').click();
  await page.getByLabel('Webhook address').fill('https://hooks.example/upvine');
  await page.getByRole('button', { name: 'Connect webhook' }).click();
  await expect(page.getByText('Save your signing secret now')).toBeVisible();
}

async function onboardWithWebhook(page: Page, connect: (page: Page) => Promise<void> = connectWebhook): Promise<void> {
  await page.goto('/en/signup');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel('Your name').fill('Content Tester');
  await page.getByLabel('Email').fill(uniqueEmail('content'));
  await page.getByLabel('Password').fill('a-long-test-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/onboarding');
  await page.getByLabel('Website address').fill('klinik.example');
  await page.getByRole('button', { name: 'Analyze my site' }).click();
  await page.getByRole('button', { name: 'Looks right, continue' }).click({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('list', { name: 'Your first topics' }).getByRole('listitem')).toHaveCount(3, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  // Site bağlantısı: webhook (imza anahtarı bir kez gösterilir)
  await expect(page.getByRole('heading', { name: 'Site connection' })).toBeVisible();
  await connect(page);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test('içerik: kurulumdan sonra yazılar otomatik yazılır, incelenir, onaylanır ve indirilir', async ({ page }) => {
  test.setTimeout(150_000);
  await onboardWithWebhook(page);

  // Kurulum bitince ilk 3 konu yazılmaya başlar (deneme hakkı: 3)
  await page.goto('/app/content');
  await expect(page.getByText('Articles this month: 3 / 3')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Waiting for your approval').first()).toBeVisible({ timeout: 60_000 });
  await expectNoA11yViolations(page);

  await page.getByRole('link', { name: 'İmplant tedavisi kaç seans sürer?' }).click();
  await expect(page.getByRole('heading', { name: 'SEO score' })).toBeVisible();
  await expect(page.getByText('Ready to rank')).toBeVisible();
  await expect(page.getByText('Verified: 1 · Corrected: 0 · Removed: 0')).toBeVisible();
  // Görsel modeli yok (sahte) ve sahte vektörlerle hiçbir sayfa görseli benzerlik eşiğini geçmiyor: marka renkleri
  await expect(page.getByText('The cover was created from your brand colors.')).toBeVisible();
  await expect(page.locator('.article-body nav[data-toc]')).toBeVisible();
  await expectNoA11yViolations(page);

  // Kapağı kullanıcının kendi görseliyle değiştir: küçük görsel reddedilir, uygun olan kaydedilir
  await page.getByRole('button', { name: 'Change cover' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change cover image' });
  await dialog.getByLabel('Image file').setInputFiles({ name: 'kucuk.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG, 'base64') });
  await expect(dialog.getByText('This file can’t be used.', { exact: false })).toBeVisible();
  await dialog.getByLabel('Image file').setInputFiles({ name: 'kapak.png', mimeType: 'image/png', buffer: FIXTURE_IMAGE_PNG });
  await dialog.getByLabel('Image description (alt text)').fill('İmplant sonrası gülümseyen hasta');
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Save cover' }).click();
  await expect(page.getByText('You uploaded this cover.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'İmplant sonrası gülümseyen hasta' })).toBeVisible();

  // İndirme (HTML)
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  await page.getByRole('menuitem', { name: 'HTML file' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('implant-tedavisi-suresi.html');

  // Onayla ve planla: yayın tarihi gelecekte, bağlı site
  await page.getByRole('button', { name: 'Approve and schedule' }).click();
  await expect(page.getByText(/Approved\. It will be published on/)).toBeVisible();
  await expect(page.getByText('Ready to publish')).toBeVisible();
});

test('içerik: reddetme sebebi seçilir ve geri alınabilir', async ({ page }) => {
  test.setTimeout(150_000);
  await onboardWithWebhook(page);
  await page.goto('/app/content');
  await expect(page.getByText('Waiting for your approval').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Şeffaf plak ile ortodonti: kimlere uygun?' }).click();
  await expect(page.getByRole('button', { name: 'Approve and schedule' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByText('Does not sound like us').click();
  await page.getByRole('button', { name: 'Reject article' }).click();
  await expect(page.getByText('You rejected this article.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Approve and schedule' })).toBeVisible();
});

test('editör: düzenlenir, bölüm yapay zekâyla yeniden yazılır, kaydedilir ve eski sürüme dönülür', async ({ page }) => {
  test.setTimeout(150_000);
  await onboardWithWebhook(page);
  await page.goto('/app/content');
  await expect(page.getByText('Waiting for your approval').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('link', { name: 'Diş beyazlatma zararlı mı?' }).click();
  await page.getByRole('button', { name: 'Edit' }).click({ timeout: 30_000 });

  const form = page.getByRole('form', { name: 'Edit post' });
  await expect(form).toBeVisible();
  await form.getByLabel('Title', { exact: true }).fill('Diş beyazlatma zararları: düzenlenmiş rehber');
  const body = page.getByRole('textbox', { name: 'Post' });
  await expect(body).toContainText('Tedavi adımları');
  // İmleç bir bölümün içinde: o bölüm yeniden yazılır
  await body.locator('p').nth(4).click();
  await page.getByRole('button', { name: 'Rewrite with AI' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rewrite this part' });
  await dialog.getByText('Shorten').click();
  await dialog.getByRole('button', { name: 'Rewrite' }).click();
  await expect(dialog.getByText('New version:')).toBeVisible({ timeout: 30_000 });
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(body).toContainText('Yeniden yazıldı');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. The SEO score was recalculated.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Diş beyazlatma zararları: düzenlenmiş rehber', level: 1 })).toBeVisible();
  await expect(page.locator('.article-body')).toContainText('Yeniden yazıldı');
  await expect(page.locator('.article-body nav[data-toc]')).toBeVisible();

  await page.getByRole('button', { name: 'Version history' }).click();
  const sheet = page.getByRole('dialog', { name: 'Version history' });
  await expect(sheet.getByRole('button', { name: /Version 2.*Current/ })).toBeVisible();
  await sheet.getByRole('button', { name: /Version 1/ }).click();
  await page.getByRole('button', { name: 'Go back to this version' }).click();
  await expect(page.getByText('The old version was restored.')).toBeVisible();
  await expect(page.locator('.article-body')).not.toContainText('Yeniden yazıldı');
  await expect(page.getByText('Version 3', { exact: false }).first()).toBeVisible();
});

test('takvim: tarih değiştirme penceresi ve sürükle-bırak ile yazı başka güne taşınır', async ({ page }) => {
  test.setTimeout(150_000);
  await onboardWithWebhook(page);
  // Yazılmakta olan yazı taşınamaz: üçünün de incelemeye düşmesini bekle.
  await page.goto('/app/content');
  await expect(page.getByText('Waiting for your approval')).toHaveCount(3, { timeout: 90_000 });
  await page.goto('/app/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const title = 'Şeffaf plak ile ortodonti';
  // Yazılan konunun başlığı yapay zekânın başlığıyla güncellenir; içinde geçmesi yeterli.
  const reschedule = page.getByRole('button', { name: new RegExp(`^Change the date of ".*${title}`) });
  await page.waitForLoadState('networkidle');
  if (!(await reschedule.isVisible())) await page.getByRole('button', { name: 'Next month' }).click();
  await expectNoA11yViolations(page);

  // Klavye/ekran okuyucu yolu: tarih penceresi (30 gün sonrasına)
  const target = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await reschedule.click();
  const dialog = page.getByRole('dialog', { name: 'Change publishing date' });
  await dialog.getByLabel('New date').fill(target);
  await dialog.getByRole('button', { name: 'Move' }).click();
  await expect(page.getByText('Publishing date updated.')).toBeVisible();

  // Sürükle-bırak: hafta görünümünde bir sonraki (ya da önceki) güne
  await page.goto(`/app/calendar?view=week&d=${target}`);
  await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const card = page.getByRole('link', { name: new RegExp(title) });
  await expect(card).toBeVisible();
  const from = card.locator('xpath=ancestor::section[1]');
  const fromLabel = await from.getAttribute('aria-label');
  const box = (await from.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  const lastColumn = box.x + box.width * 2 > (page.viewportSize()?.width ?? 1280);
  const dx = lastColumn ? -box.width : box.width;
  await page.mouse.move(cardBox.x + 4, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + 20, cardBox.y + cardBox.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText('Publishing date updated.').first()).toBeVisible();
  await expect(card.locator('xpath=ancestor::section[1]')).not.toHaveAttribute('aria-label', fromLabel!);

  // 375 px, Almanca: ızgara yerine gün listesi, taşma yok
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'Deutsch' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByRole('heading', { name: 'Kalender', level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Monat', exact: true }).click();
  await expectNoHorizontalOverflow(page);
});

test('CMS: Webflow koleksiyonu bulunur, alanlar eşlenir ve bağlanır', async ({ page }) => {
  test.setTimeout(150_000);
  await onboardWithWebhook(page, async (p) => {
    await p.getByText('Webflow', { exact: true }).click();
    await p.getByLabel('Site API token').fill('wf-fake-token');
    await p.getByRole('button', { name: 'Find collections' }).click();
    // İlk zengin metin alanlı koleksiyon seçilir, alanlar adlarından tahmin edilir
    await expect(p.getByText('Choose the field for each part of the article.', { exact: false })).toBeVisible();
    await expect(p.getByRole('combobox', { name: 'Article body' })).toHaveText(/Post Body/);
    await expect(p.getByRole('combobox', { name: 'Cover image' })).toHaveText(/Main Image/);
    await expectNoA11yViolations(p);
    await p.getByRole('button', { name: 'Connect Webflow' }).click();
  });
  await page.goto('/app/settings');
  await expect(page.getByText('Webflow', { exact: true })).toBeVisible();
  await expect(page.getByText('Blog Posts')).toBeVisible();
});

test('Yazılarım: WordPress bağlanınca mevcut yazılar okunur ve SEO sorunlarıyla listelenir', async ({ page }) => {
  test.setTimeout(150_000);
  await onboardWithWebhook(page, async (p) => {
    await p.getByText('WordPress', { exact: true }).click();
    await p.getByLabel('WordPress site address').fill('https://wp.example');
    await p.getByLabel('WordPress username').fill('editor');
    await p.getByLabel('Application password').fill('abcd efgh ijkl mnop qrst uvwx');
    await p.getByRole('button', { name: 'Connect WordPress' }).click();
  });
  await page.goto('/app/results');
  await page.getByRole('tab', { name: 'My articles' }).click();
  // Eşitleme worker'da: en sorunlu yazı üstte, sorunlar açılınca nasıl düzeltileceği
  await expect(page.getByRole('link', { name: /Diş beyazlatma – fiyatlar/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('2 posts read; 1 have issues you can fix.', { exact: false })).toBeVisible();
  await page.getByText('See 5 issues').click();
  await expect(page.getByText('Content is very short (5 words)')).toBeVisible();
  await expectNoA11yViolations(page);

  // Güncelleme önerisi: worker hazırlar, önce/sonra görülür, uygulanır ve geri alınır
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /Diş beyazlatma – fiyatlar/ }) });
  await row.getByRole('button', { name: 'Suggest an update' }).click();
  const dialog = page.getByRole('dialog', { name: 'Update suggestion' });
  await expect(dialog.getByRole('heading', { name: 'What changes' })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText('Sık sorulan sorular bölümü eklendi.')).toBeVisible();
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog.getByText(/This suggestion was applied on your site/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Undo' }).click();
  await expect(dialog.getByText(/This suggestion was undone/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('1 of 10 update suggestions used this month.')).toBeVisible();

  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'Deutsch' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByRole('heading', { name: 'Beiträge auf Ihrer Website' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Sonuçlar: genel bakış, anahtar kelimeler ve AI görünürlük ölçümü', async ({ page }) => {
  test.setTimeout(150_000);
  await onboardWithWebhook(page);
  await page.goto('/app/results');

  // Genel bakış: Search Console yokken içerik özeti
  await expect(page.getByRole('heading', { name: 'Visibility on Google' })).toBeVisible();
  await expect(page.getByText('Articles published this month')).toBeVisible();
  await expectNoA11yViolations(page);

  // Anahtar kelimeler: plandaki kelimeler
  await page.getByRole('tab', { name: 'Keywords' }).click();
  await expect(page.getByRole('cell', { name: /implant tedavisi süresi/ })).toBeVisible();
  await expect(page.getByText('In your plan').first()).toBeVisible();
  await expectNoA11yViolations(page);

  // AI görünürlük: sorular üretilir, sorulur; implant sorusunda marka anılır (sahte yapay zekâ)
  await page.getByRole('tab', { name: 'AI visibility' }).click();
  await page.getByRole('button', { name: 'Start measuring' }).click();
  await expect(page.getByText('Mentioned', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Not mentioned', { exact: true })).toHaveCount(2);
  await expect(page.getByText('33%')).toBeVisible();
  await page.getByText('Show the AI’s answer').first().click();
  await expect(page.getByText('Gülüş Diş Kliniği implant tedavisinde', { exact: false })).toBeVisible();
  await page.getByLabel('New question').fill('Kadıköy’de diş taşı temizliği nerede yapılır?');
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('Kadıköy’de diş taşı temizliği nerede yapılır?')).toBeVisible();
  await expect(page.getByText('Not asked yet')).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'Deutsch' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByText('Nennungsrate').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('tab', { name: 'Keywords' }).click();
  await expectNoHorizontalOverflow(page);
});
