import pino from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '@upvine/config/env';
import { connectDb, membershipsRepository, organizationsRepository, usersRepository } from '@upvine/db';
import { truncateAll } from '@upvine/db/testing';
import { MemoryMailer } from '@upvine/email';
import { billingTick } from '../src/jobs/billing-jobs';

const env = loadEnv({ NODE_ENV: 'test' });
const sequelize = connectDb(env, { database: env.MYSQL_TEST_DATABASE });
const logger = pino({ level: 'silent' });
const DAY = 86_400_000;

beforeEach(() => truncateAll(sequelize));
afterAll(() => sequelize.close());

async function paidOrg(periodEnd: Date) {
  const owner = await usersRepository.create({ email: `o${Math.random()}@x.com`, name: 'Ayşe', passwordHash: null, locale: 'tr' });
  const editor = await usersRepository.create({ email: `e${Math.random()}@x.com`, name: 'Can', passwordHash: null, locale: 'en' });
  const org = await organizationsRepository.create({ name: 'O', slug: `o-${Math.random()}`, defaultLocale: 'tr' });
  await membershipsRepository.create({ orgId: org.id, userId: owner.id, role: 'owner' });
  await membershipsRepository.create({ orgId: org.id, userId: editor.id, role: 'editor' });
  await org.update({ plan: 'growth', planSource: 'paid', planStatus: 'active', currentPeriodEnd: periodEnd });
  return { org, owner };
}

describe('ödenmiş dönem zamanlayıcısı', () => {
  it('dönem sonuna 3 gün kala sahibe bir kez hatırlatma; dönemi biten "süresi doldu"', async () => {
    const now = new Date('2026-10-21T12:00:00Z');
    const soon = await paidOrg(new Date(now.getTime() + 2 * DAY));
    await paidOrg(new Date(now.getTime() + 10 * DAY));
    const lapsed = await paidOrg(new Date(now.getTime() - DAY));
    const mailer = new MemoryMailer();

    expect(await billingTick({ env, mailer, logger }, now)).toEqual({ reminded: 1, lapsed: 1 });
    // Sadece sahip/yönetici, kendi dilinde
    expect(mailer.sent.map((m) => m.to)).toEqual([soon.owner.email]);
    expect(mailer.sent[0]!.subject).toContain('Growth');
    expect(mailer.sent[0]!.text).toContain('/app/billing?plan=growth');
    expect((await organizationsRepository.findById(lapsed.org.id))?.planStatus).toBe('past_due');

    // Aynı dönem için tekrar gönderilmez
    expect(await billingTick({ env, mailer, logger }, new Date(now.getTime() + 60_000))).toEqual({ reminded: 0, lapsed: 0 });
    // Yenilenen dönem (yeni bitiş) için tekrar hatırlatılır
    await soon.org.update({ currentPeriodEnd: new Date(now.getTime() + 2.5 * DAY), renewalRemindedFor: null });
    expect((await billingTick({ env, mailer, logger }, now)).reminded).toBe(1);
  });
});
