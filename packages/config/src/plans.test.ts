import { describe, expect, it } from 'vitest';
import { addBillingInterval, effectivePlan, orderAmounts, orgArticleLimit, orgFeatures, orgSiteLimit } from './plans';

const now = new Date('2026-10-12T12:00:00Z');

describe('organizasyon hakları', () => {
  it('paket yok: deneme (ayda 3 yazı, 1 site) ama Growth özellikleri', () => {
    const trial = { plan: null, planSource: 'trial' };
    expect(effectivePlan(trial, now)).toBeNull();
    expect(orgArticleLimit(trial, undefined, now)).toBe(3);
    expect(orgSiteLimit(trial, now)).toBe(1);
    expect(orgFeatures(trial, now).aiVisibility).toBe(true);
  });

  it('admin’in verdiği ödemesiz Agency: tam yetki; özel makale hakkı paketinkini geçersiz kılar', () => {
    const comp = { plan: 'agency', planSource: 'complimentary', articleQuotaOverride: null, entitlementExpiresAt: null };
    expect(effectivePlan(comp, now)).toBe('agency');
    expect(orgArticleLimit(comp, undefined, now)).toBe(100);
    expect(orgSiteLimit(comp, now)).toBe(5);
    expect(orgArticleLimit({ ...comp, articleQuotaOverride: 250 }, undefined, now)).toBe(250);
    // Paketsiz sadece özel hak da verilebilir
    expect(orgArticleLimit({ plan: null, planSource: 'complimentary', articleQuotaOverride: 20 }, undefined, now)).toBe(20);
  });

  it('süresi dolan ödemesiz haklar denemeye döner; geliştirme ayarı paketin yerine geçer ama admin hakkının değil', () => {
    const expired = { plan: 'agency', planSource: 'complimentary', articleQuotaOverride: 250, entitlementExpiresAt: new Date('2026-10-01T00:00:00Z') };
    expect(effectivePlan(expired, now)).toBeNull();
    expect(orgArticleLimit(expired, undefined, now)).toBe(3);
    expect(orgSiteLimit(expired, now)).toBe(1);
    expect(orgArticleLimit(expired, 7, now)).toBe(7);
    expect(orgArticleLimit({ plan: null, planSource: 'complimentary', articleQuotaOverride: 50 }, 7, now)).toBe(50);
    // Ödemeli paket admin bitiş tarihinden değil, ödenmiş dönemin sonundan etkilenir
    const paid = { plan: 'starter', planSource: 'paid', entitlementExpiresAt: new Date('2026-01-01T00:00:00Z'), currentPeriodEnd: new Date('2026-11-12T12:00:00Z') };
    expect(effectivePlan(paid, now)).toBe('starter');
    expect(effectivePlan({ ...paid, currentPeriodEnd: new Date('2026-10-12T11:59:00Z') }, now)).toBeNull();
    expect(effectivePlan({ ...paid, currentPeriodEnd: null }, now)).toBeNull();
  });
});

describe('ödeme tutarları ve dönem', () => {
  it('KDV sadece Türkiye fatura adresine eklenir', () => {
    expect(orderAmounts('growth', 'monthly', 'TR', 20)).toEqual({ netCents: 7900, vatRate: 20, vatCents: 1580, totalCents: 9480 });
    expect(orderAmounts('growth', 'monthly', 'de', 20)).toEqual({ netCents: 7900, vatRate: 0, vatCents: 0, totalCents: 7900 });
    expect(orderAmounts('agency', 'yearly', 'tr', 20).totalCents).toBe(238800);
  });

  it('dönem sonu: ay sonu taşmaz, yıllık bir yıl', () => {
    expect(addBillingInterval(new Date('2026-01-31T10:00:00Z'), 'monthly').toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addBillingInterval(new Date('2026-10-21T10:00:00Z'), 'monthly').toISOString()).toBe('2026-11-21T10:00:00.000Z');
    expect(addBillingInterval(new Date('2028-02-29T00:00:00Z'), 'yearly').toISOString()).toBe('2029-02-28T00:00:00.000Z');
  });
});
