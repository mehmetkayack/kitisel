import { isLocale, RENEWAL_REMINDER_DAYS } from '@upvine/config';
import type { Env } from '@upvine/config/env';
import { billingOrgRepository, membershipsRepository, usersRepository } from '@upvine/db';
import { renderRenewalReminder } from '@upvine/email';
import type { Mailer } from '@upvine/email';
import type { Logger } from 'pino';

export interface BillingTickDeps {
  env: Env;
  mailer: Mailer;
  logger: Logger;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * Dakikalık zamanlayıcıda (Bölüm 7.15, otomatik çekim yok): ödenmiş dönemi bitmek üzere olan
 * organizasyonun sahip ve yöneticilerine dönem başına bir kez "yenileyin" e-postası; dönemi bitenlerin
 * durumu "süresi doldu" (haklar zaten dönem sonunda denemeye döner).
 */
export async function billingTick(deps: BillingTickDeps, now = new Date()): Promise<{ reminded: number; lapsed: number }> {
  const lapsed = await billingOrgRepository.markLapsed(now);
  const due = await billingOrgRepository.dueForReminder(now, new Date(now.getTime() + RENEWAL_REMINDER_DAYS * DAY_MS));
  let reminded = 0;
  for (const org of due) {
    const periodEnd = org.currentPeriodEnd!;
    const plan = org.plan ? org.plan.charAt(0).toUpperCase() + org.plan.slice(1) : '';
    const members = (await membershipsRepository.listForOrg(org.id)).filter((m) => m.role === 'owner' || m.role === 'admin');
    for (const m of members) {
      const user = await usersRepository.findById(m.userId);
      if (!user) continue;
      const locale = isLocale(user.locale) ? user.locale : 'en';
      try {
        const email = await renderRenewalReminder(locale, {
          name: user.name,
          url: `${deps.env.WEB_URL}/app/billing?plan=${org.plan ?? ''}`,
          plan,
          until: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(periodEnd),
        });
        await deps.mailer.send({ to: user.email, ...email });
      } catch (err) {
        deps.logger.error({ err, orgId: org.id }, 'yenileme hatırlatması gönderilemedi');
      }
    }
    // Gönderilemese de işaretlenir: her dakika tekrar denenip kullanıcıya yağmur gibi e-posta gitmesin
    await billingOrgRepository.markReminded(org.id, periodEnd);
    reminded++;
  }
  return { reminded, lapsed };
}
