import { expect, request, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BASE_URL } from './env';
import { expectNoA11yViolations, expectNoHorizontalOverflow } from './helpers';

/** E2E veritabanına global-setup ile eklenen superadmin (packages/db/src/seed.ts) */
const ADMIN = { email: 'admin@upvine.local', password: 'admin-password-123', name: 'Upvine Admin' };
/** Ayarlıysa ekran görüntüleri buraya yazılır (faz onayı için) */
const SHOTS = process.env.SALES_SCREENSHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function setAdminLocale(locale: string) {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/v1/auth/login', { data: ADMIN });
  const { accessToken } = (await res.json()) as { accessToken: string };
  await ctx.patch('/api/v1/me', { data: { locale }, headers: { authorization: `Bearer ${accessToken}` } });
  await ctx.dispose();
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());

test('satış masası: içe aktar, mesajı kopyala, gönderildi işaretle, haftalık Instagram planı', async ({ page, context }) => {
  const run = Date.now();
  const domain = `dis-${run}.example.com`;
  const seed = {
    leads: [
      {
        id: domain,
        name: 'Gülüş Diş Kliniği',
        sector: 'Diş kliniği',
        city: 'İstanbul · Kadıköy',
        website: `https://www.${domain}/`,
        email: `info@${domain}`,
        phone: '0216 000 00 00',
        instagram: 'gulusdis',
        channel: 'E-posta',
        status: 'Yeni',
        finding: 'Ana sayfadaki blog bölümünde yazı yerine şablon metni duruyor.',
        message: 'Konu: Sitenizdeki blog bölümü\n\nMerhaba,\n\nSitenizde bir şey dikkatimi çekti.\n\n[Adın]\nKitisel · kitisel.com',
        followUp: 'Merhaba, geçen hafta yazmıştım. [Adın]',
      },
      { id: `guzellik-${run}.example.com`, name: 'Işıl Güzellik', sector: 'Güzellik merkezi', city: 'Ankara · Çankaya', website: `https://guzellik-${run}.example.com`, channel: 'Instagram DM', status: 'Yeni', instagram: 'isilguzellik' },
      { id: `hukuk-${run}.example.com`, name: 'Av. Deniz Hukuk Bürosu', sector: 'Avukat', city: 'İzmir · Alsancak', website: `https://hukuk-${run}.example.com`, channel: 'Yüz yüze', status: 'Mesaj gönderildi', contactedAt: new Date().toISOString() },
    ],
    posts: [
      {
        id: `${today}-tanisma-${run}`,
        date: today,
        time: '19:30',
        format: 'Tekli görsel',
        pillar: 'Tanışma',
        title: 'Merhaba, ben Kit',
        status: 'Taslak',
        visual: 'Turuncu zemin, tilki maskot',
        caption: 'Merhaba, ben Kit.',
        hashtags: '#seo #kobi',
      },
    ],
  };

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await setAdminLocale('tr');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  // Liste + JSON içe aktarma (önizleme → onay)
  await page.goto('/admin/sales');
  await expect(page.getByRole('heading', { name: 'Satış', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'JSON içe aktar' }).click();
  const dialog = page.getByRole('dialog', { name: 'JSON içe aktar' });
  await dialog.getByLabel('JSON dosyası').setInputFiles({ name: 'seed-data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await expect(dialog.getByText('Eklenecek: 3')).toBeVisible();
  await expect(dialog.getByText('Eklenecek: 1')).toBeVisible();
  await dialog.getByRole('button', { name: 'İçe aktar' }).click();
  await expect(page.getByText('İçe aktarıldı: 3 aday, 1 gönderi.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gülüş Diş Kliniği' })).toBeVisible();

  // Durum şeridi: "Mesaj gönderildi" süzgeci
  await page.getByRole('button', { name: /^Mesaj gönderildi/ }).click();
  await expect(page.getByRole('link', { name: 'Av. Deniz Hukuk Bürosu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gülüş Diş Kliniği' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Tümü/ }).click();
  await expect(page.getByRole('link', { name: 'Gülüş Diş Kliniği' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);
  await shot(page, '1-adaylar-390');

  // Ayrıntı: mesajı kopyala ([Adın] → admin adı), gönderdim, not
  await page.getByRole('link', { name: 'Gülüş Diş Kliniği' }).click();
  await expect(page.getByRole('heading', { name: 'Gülüş Diş Kliniği', level: 1 })).toBeVisible();
  await expect(page.getByText('Ana sayfadaki blog bölümünde yazı yerine şablon metni duruyor.')).toBeVisible();
  await page.getByRole('button', { name: 'Mesajı kopyala' }).click();
  await expect(page.getByText('Kopyalandı', { exact: true })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain(ADMIN.name);
  expect(clip).not.toContain('[Adın]');
  await expect(page.getByText('Mesaj kopyalandı')).toBeVisible();
  await expect(page.getByRole('link', { name: 'E-posta uygulamasında aç' })).toHaveAttribute('href', /^mailto:info@dis-\d+\.example\.com\?subject=Sitenizdeki%20blog%20b%C3%B6l%C3%BCm%C3%BC&body=Merhaba/);

  await page.getByRole('button', { name: 'Gönderdim' }).click();
  await expect(page.getByText('Durum güncellendi.')).toBeVisible();
  await expect(page.getByText(/^Sonraki takip:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Takip gönderdim' })).toBeVisible();
  await expect(page.getByText('Durum: Yeni → Mesaj gönderildi')).toBeVisible();

  await page.getByLabel('Yeni not').fill('Salı öğleden sonra aranacak.');
  await page.getByRole('button', { name: 'Not ekle' }).click();
  await expect(page.getByText('Salı öğleden sonra aranacak.')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);
  await shot(page, '2-aday-ayrinti-390');

  // Instagram planı: bu haftanın kartı, metni kopyala
  await page.goto('/admin/sales');
  await page.getByRole('link', { name: 'Instagram planı' }).click();
  await expect(page).toHaveURL(/\/admin\/sales\/posts$/);
  const card = page.getByRole('link', { name: /Merhaba, ben Kit/ });
  await expect(card).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);
  await shot(page, '3-instagram-plani-390');

  await card.click();
  await expect(page.getByRole('heading', { name: 'Merhaba, ben Kit', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Metni kopyala' }).click();
  await expect(page.getByText('Kopyalandı', { exact: true }).first()).toBeVisible();
  // Windows panosu satır sonlarını \r\n olarak döndürür
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('Merhaba, ben Kit.\n\n#seo #kobi');
  await expect(page.getByRole('link', { name: "Meta Business Suite'i aç" })).toHaveAttribute('href', 'https://business.facebook.com/latest/posts/');
  await expectNoHorizontalOverflow(page);
  await expectNoA11yViolations(page);
  await shot(page, '4-gonderi-390');

  // Masaüstü görünümleri ve genel bakış kartı
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Satış', level: 2 })).toBeVisible();
  await expect(page.getByText('Bu hafta paylaşılacak gönderi')).toBeVisible();
  await shot(page, '5-genel-bakis-masaustu');
  await page.goto('/admin/sales');
  await expect(page.getByRole('link', { name: 'Gülüş Diş Kliniği' })).toBeVisible();
  await shot(page, '6-adaylar-masaustu');
  await page.getByRole('link', { name: 'Gülüş Diş Kliniği' }).click();
  await expect(page.getByText('Salı öğleden sonra aranacak.')).toBeVisible();
  await shot(page, '7-aday-ayrinti-masaustu');
  await page.goto('/admin/sales/posts');
  await expect(page.getByRole('link', { name: /Merhaba, ben Kit/ })).toBeVisible();
  await shot(page, '8-instagram-plani-masaustu');
});
