import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPaytrProvider, paytrCallbackHash, paytrIframeHash, parseTcmbUsdRate } from './index';

const cfg = { merchantId: '123456', merchantKey: 'KEY', merchantSalt: 'SALT', testMode: true };

describe('PayTR', () => {
  it('iFrame imzası: alanlar dokümandaki sırayla + salt, merchant_key ile HMAC-SHA256, base64', () => {
    const f = { userIp: '85.1.2.3', merchantOid: 'KT1', email: 'a@b.com', paymentAmount: 9480, userBasket: 'W10=', noInstallment: 1 as const, maxInstallment: 0, currency: 'USD', testMode: 1 as const };
    const expected = createHmac('sha256', 'KEY').update('12345685.1.2.3KT1a@b.com9480W10=10USD1SALT').digest('base64');
    expect(paytrIframeHash(cfg, f)).toBe(expected);
  });

  it('token isteği: anahtar ve salt gövdede yok, tutar sent, sepet base64; iframe adresi döner', async () => {
    let sent: URLSearchParams | null = null;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = init?.body as URLSearchParams;
      return new Response(JSON.stringify({ status: 'success', token: 'tok123' }));
    }) as typeof fetch;
    const provider = createPaytrProvider(cfg, fetchImpl);
    const out = await provider.startCheckout({
      reference: 'KTABC', userIp: '85.1.2.3', email: 'a@b.com', name: 'Ayşe', address: 'İstanbul', phone: '5551112233',
      itemName: 'Kitisel Growth', currency: 'USD', amountMinor: 9480, okUrl: 'https://x/ok', failUrl: 'https://x/fail', lang: 'tr',
    });
    expect(out.iframeUrl).toBe('https://www.paytr.com/odeme/guvenli/tok123');
    const body = sent as unknown as URLSearchParams;
    expect(body.get('payment_amount')).toBe('9480');
    expect(body.get('currency')).toBe('USD');
    expect(body.get('test_mode')).toBe('1');
    expect(JSON.parse(Buffer.from(body.get('user_basket')!, 'base64').toString())).toEqual([['Kitisel Growth', '94.80', 1]]);
    expect(body.toString()).not.toContain('KEY');
    expect(body.toString()).not.toContain('SALT');
  });

  it('token reddedilirse sebep hataya yazılır', async () => {
    const provider = createPaytrProvider(cfg, (async () => new Response(JSON.stringify({ status: 'failed', reason: 'Zorunlu alan degeri gecersiz: user_ip' }))) as typeof fetch);
    await expect(provider.startCheckout({ reference: 'K', userIp: '', email: 'a@b.com', name: 'A', address: 'B', phone: '1', itemName: 'X', currency: 'TL', amountMinor: 1, okUrl: 'o', failUrl: 'f', lang: 'en' })).rejects.toThrow(/user_ip/);
  });

  it('bildirim: doğru imza kabul, yanlış imza ve eksik alan reddedilir', () => {
    const provider = createPaytrProvider(cfg);
    const hash = paytrCallbackHash(cfg, { merchantOid: 'KTABC', status: 'success', totalAmount: '9480' });
    expect(provider.parseNotification({ merchant_oid: 'KTABC', status: 'success', total_amount: '9480', hash, currency: 'USD', test_mode: '1' })).toEqual({
      reference: 'KTABC', status: 'success', totalCents: 9480, currency: 'USD', testMode: true, failureCode: null, failureMessage: null,
    });
    expect(provider.parseNotification({ merchant_oid: 'KTABC', status: 'success', total_amount: '9481', hash })).toBeNull();
    expect(provider.parseNotification({ merchant_oid: 'KTABC', status: 'success', total_amount: '9480' })).toBeNull();
  });
});

describe('TCMB kuru', () => {
  it('USD döviz satış ve bülten tarihi okunur', () => {
    const xml = '<Tarih_Date Tarih="21.10.2026" Date="10/21/2026"><Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><ForexBuying>49.5123</ForexBuying><ForexSelling>49.6015</ForexSelling></Currency><Currency Kod="EUR" CurrencyCode="EUR"><ForexSelling>57.1</ForexSelling></Currency></Tarih_Date>';
    expect(parseTcmbUsdRate(xml)).toEqual({ rate: 49.6015, date: '21.10.2026' });
    expect(parseTcmbUsdRate('<x/>')).toBeNull();
  });
});
