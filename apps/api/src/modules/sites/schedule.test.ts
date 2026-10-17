import { describe, expect, it } from 'vitest';
import { moveToDate, planPublishDates, zonedTime } from '@upvine/shared';

describe('planPublishDates', () => {
  // 2026-10-09 Cuma, 15:00 UTC
  const now = new Date('2026-10-09T15:00:00Z');

  it('seçilen günlerde, sitenin saat diliminde planlar (yarından başlayarak)', () => {
    const dates = planPublishDates({ count: 3, days: [1, 3], time: '10:00', timeZone: 'Europe/Istanbul', now });
    expect(dates.map((d) => d.toISOString())).toEqual(['2026-10-12T07:00:00.000Z', '2026-10-14T07:00:00.000Z', '2026-10-19T07:00:00.000Z']);
  });

  it('yeni sitede ilk ay haftada en fazla 3 yazı', () => {
    const dates = planPublishDates({ count: 6, days: [0, 1, 2, 3, 4, 5, 6], time: '09:00', timeZone: 'UTC', now, newSite: true });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-17', '2026-10-18', '2026-10-19']);
  });

  it('yaz saati geçişini doğru hesaplar ve geçersiz saat diliminde UTC kullanır', () => {
    // New York: 2 Kasım 2026 EST (UTC-5), 31 Ekim EDT (UTC-4)
    expect(zonedTime(2026, 11, 2, 10, 0, 'America/New_York').toISOString()).toBe('2026-11-02T15:00:00.000Z');
    expect(zonedTime(2026, 10, 31, 10, 0, 'America/New_York').toISOString()).toBe('2026-10-31T14:00:00.000Z');
    expect(planPublishDates({ count: 1, days: [6], time: '08:15', timeZone: 'Mars/Base', now })[0]?.toISOString()).toBe('2026-10-10T08:15:00.000Z');
  });

  it('gün seçilmemişse plan üretmez', () => {
    expect(planPublishDates({ count: 3, days: [], time: '10:00', timeZone: 'UTC', now })).toEqual([]);
  });
});

describe('moveToDate', () => {
  const now = new Date('2026-10-09T15:00:00Z');

  it('yazıyı sitenin saat diliminde başka güne taşır, saati korur; yoksa yayın saati', () => {
    const current = new Date('2026-10-12T07:30:00Z'); // İstanbul 10:30
    expect(moveToDate({ date: '2026-10-20', current, publishTime: '09:00', timeZone: 'Europe/Istanbul', now })?.toISOString()).toBe('2026-10-20T07:30:00.000Z');
    expect(moveToDate({ date: '2026-10-20', current: null, publishTime: '09:00', timeZone: 'America/New_York', now })?.toISOString()).toBe('2026-10-20T13:00:00.000Z');
  });

  it('geçmiş an ve bozuk tarih reddedilir', () => {
    const current = new Date('2026-10-12T07:30:00Z');
    expect(moveToDate({ date: '2026-10-08', current, publishTime: '09:00', timeZone: 'Europe/Istanbul', now })).toBeNull();
    // Bugün ama saat geçmiş (İstanbul 18:00, hedef 10:30)
    expect(moveToDate({ date: '2026-10-09', current, publishTime: '09:00', timeZone: 'Europe/Istanbul', now })).toBeNull();
    expect(moveToDate({ date: '2026-13-40x', current, publishTime: '09:00', timeZone: 'UTC', now })).toBeNull();
  });
});
