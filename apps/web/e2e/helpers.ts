import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Her test kendi kullanıcısını oluşturur: veritabanı durumundan bağımsız. */
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** WCAG 2.1 AA ihlali varsa test başarısız olur (Bölüm 6.5 madde 11). */
export async function expectNoA11yViolations(page: Page, opts: { includeToasts?: boolean } = {}): Promise<void> {
  await page.waitForLoadState('networkidle');
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  // Bildirimler gelip giderken (yarı saydam animasyon, yığılma, modal katmanı) kontrast yanlış ölçülüyor
  // ve test rastgele düşüyordu. Bildirim bileşeni /dev/ui'da, animasyon bittikten sonra ayrıca denetlenir.
  if (!opts.includeToasts) builder = builder.exclude('[data-sonner-toaster]');
  const results = await builder.analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

/** Yatay taşma yok (Almanca metinler dahil, Bölüm 2). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'sayfa yatay olarak taşıyor').toBeLessThanOrEqual(0);
}

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
}

/** Mailpit API'den alıcıya giden son e-postanın düz metnini bekler. */
export async function waitForEmail(to: string, subjectIncludes: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    if (res.ok) {
      const body = (await res.json()) as { messages: MailpitSummary[] };
      const hit = body.messages.find((m) => m.Subject.includes(subjectIncludes));
      if (hit) {
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string };
        return msg.Text;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`E-posta gelmedi: ${to} / ${subjectIncludes}`);
}

export function linkFromEmail(text: string, path: string): string {
  const match = new RegExp(`https?://[^\\s]+${path}\\?token=[\\w%-]+`).exec(text);
  if (!match) throw new Error(`E-postada ${path} linki yok`);
  return match[0];
}
