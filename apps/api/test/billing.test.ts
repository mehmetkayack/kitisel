import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { paytrCallbackHash } from '@upvine/billing';
import { membershipsRepository, organizationsRepository, usersRepository } from '@upvine/db';
import type { AdminBillingOrder, AuthResponse, BillingOverview, CheckoutResponse, Page } from '@upvine/shared';
import { createTestContext } from './helpers';

// Varsayılan testler USD kart tahsilatı; TL tahsilat ayrı bağlamda
const PAYTR = { PAYTR_MERCHANT_ID: '123456', PAYTR_MERCHANT_KEY: 'test-key', PAYTR_MERCHANT_SALT: 'test-salt', PAYTR_TEST_MODE: 'true', PAYTR_CURRENCY: 'USD' };
const BANK = { BANK_ACCOUNT_HOLDER: 'Kitisel Yazılım A.Ş.', BANK_NAME: 'Örnek Bank', BANK_IBAN_USD: 'TR00 0000 0000 0000 0000 0000 01', BANK_IBAN_TRY: 'TR00 0000 0000 0000 0000 0000 02' };
const ctx = createTestContext({ ...PAYTR, ...BANK, BILLING_VAT_RATE: '20', CONTACT_NOTIFY_EMAIL: 'owner@kitisel.com', LEGAL_EMAIL: '' });
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const paytrCfg = { merchantId: '123456', merchantKey: 'test-key', merchantSalt: 'test-salt', testMode: true };

const TCMB_XML = '<Tarih_Date Tarih="21.10.2026"><Currency Kod="USD" CurrencyCode="USD"><ForexSelling>40.0000</ForexSelling></Currency></Tarih_Date>';
let tokenRequests: URLSearchParams[] = [];

/** Sahte PayTR, TCMB ve genel IP servisi */
const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  if (u.startsWith('https://www.paytr.com/odeme/api/get-token')) {
    tokenRequests.push(init?.body as URLSearchParams);
    return new Response(JSON.stringify({ status: 'success', token: 'tok123' }));
  }
  if (u.startsWith('https://www.tcmb.gov.tr/')) return new Response(TCMB_XML);
  if (u.startsWith('https://api.ipify.org')) return new Response('85.1.2.3');
  throw new Error(`beklenmeyen istek: ${u}`);
}) as typeof fetch;

beforeEach(async () => {
  await ctx.reset();
  tokenRequests = [];
  ctx.setFetch(fakeFetch);
});
afterAll(() => ctx.close());

async function signup(email = 'ayse@example.com') {
  const res = await api().post('/api/v1/auth/signup').send({ email, name: 'Ayşe', password: 'long-enough-password' }).expect(201);
  const body = res.body as AuthResponse;
  const [membership] = await membershipsRepository.listForUser(body.user.id);
  return { token: body.accessToken, userId: body.user.id, orgId: membership!.organizationId };
}

const billingInfo = {
  billingType: 'individual',
  billingName: 'Ayşe Yılmaz',
  phone: '+90 532 000 00 00',
  address: 'Moda Cad. No 1, Kadıköy, İstanbul',
  country: 'TR',
  taxId: '',
  taxOffice: '',
  acceptTerms: true,
};

function callback(reference: string, status: 'success' | 'failed', totalAmount: string, extra: Record<string, string> = {}) {
  const hash = paytrCallbackHash(paytrCfg, { merchantOid: reference, status, totalAmount });
  return api()
    .post('/api/v1/billing/paytr/callback')
    .type('form')
    .send({ merchant_oid: reference, status, total_amount: totalAmount, hash, payment_amount: totalAmount, currency: 'USD', test_mode: '1', payment_type: 'card', ...extra });
}

describe('ödeme sayfası', () => {
  it('yöntemler ortam ayarlarından; deneme hesabında paket yok', async () => {
    const { token } = await signup();
    const res = await api().get('/api/v1/billing').set(auth(token)).expect(200);
    const body = res.body as BillingOverview;
    expect(body).toMatchObject({ plan: null, planSource: 'trial', canManage: true, vatRate: 20, methods: { card: true, bankTransfer: ['USD', 'TRY'] }, pendingTransfer: null, orders: [] });
    expect(body.bankAccounts.map((a) => a.iban)).toEqual([BANK.BANK_IBAN_USD, BANK.BANK_IBAN_TRY]);

    const bare = createTestContext({ PAYTR_MERCHANT_ID: '', BANK_ACCOUNT_HOLDER: '' });
    try {
      const signupRes = await request(bare.app).post('/api/v1/auth/signup').send({ email: 'b@example.com', name: 'B', password: 'long-enough-password' }).expect(201);
      const overview = (await request(bare.app).get('/api/v1/billing').set(auth((signupRes.body as AuthResponse).accessToken)).expect(200)).body as BillingOverview;
      expect(overview.methods).toEqual({ card: false, bankTransfer: [] });
      await request(bare.app)
        .post('/api/v1/billing/checkout')
        .set(auth((signupRes.body as AuthResponse).accessToken))
        .send({ ...billingInfo, plan: 'growth', interval: 'monthly', method: 'card' })
        .expect(503);
    } finally {
      await bare.close();
    }
  });

  it('şirket faturasında vergi numarası, Türkiye’de vergi dairesi zorunlu; sözleşme onayı zorunlu', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/v1/billing/checkout')
      .set(auth(token))
      .send({ ...billingInfo, billingType: 'company', plan: 'growth', interval: 'monthly', method: 'card', acceptTerms: false })
      .expect(400);
    const paths = (res.body.error.details.fields as { path: string }[]).map((f) => f.path).sort();
    expect(paths).toEqual(['acceptTerms', 'taxId', 'taxOffice']);
  });
});

describe('geliştirmede test havale hesabı', () => {
  it('banka bilgisi yoksa geliştirmede TEST hesabı gösterilir, sipariş test olarak işaretlenir; production ve testte gösterilmez', async () => {
    const dev = createTestContext({ NODE_ENV: 'development', PAYTR_MERCHANT_ID: '', BANK_ACCOUNT_HOLDER: '' });
    try {
      const s = (await request(dev.app).post('/api/v1/auth/signup').send({ email: 'dev@example.com', name: 'Dev', password: 'long-enough-password' }).expect(201)).body as AuthResponse;
      const overview = (await request(dev.app).get('/api/v1/billing').set(auth(s.accessToken)).expect(200)).body as BillingOverview;
      expect(overview.methods).toEqual({ card: false, bankTransfer: ['USD', 'TRY'] });
      expect(overview.bankAccounts.every((a) => a.test)).toBe(true);
      const { order } = (await request(dev.app)
        .post('/api/v1/billing/checkout')
        .set(auth(s.accessToken))
        .send({ ...billingInfo, plan: 'starter', interval: 'monthly', method: 'bank_transfer', transferCurrency: 'USD' })
        .expect(201)).body as CheckoutResponse;
      expect(order.testMode).toBe(true);
    } finally {
      await dev.close();
    }
    // Gerçek hesap tanımlıysa sahte hesap eklenmez
    const { token } = await signup();
    const real = (await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview;
    expect(real.bankAccounts.some((a) => a.test)).toBe(false);
  });
});

describe('kart (PayTR)', () => {
  it('ödeme formu açılır; bildirim imzalıysa paket açılır, tekrar gelen bildirim dönemi iki kez uzatmaz', async () => {
    const { token, orgId } = await signup();
    const res = await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, plan: 'growth', interval: 'monthly', method: 'card' }).expect(201);
    const { order, iframeUrl } = res.body as CheckoutResponse;
    expect(iframeUrl).toBe('https://www.paytr.com/odeme/guvenli/tok123');
    // Türkiye: $79 + %20 KDV
    expect(order).toMatchObject({ status: 'pending', method: 'card', netCents: 7900, vatCents: 1580, totalCents: 9480, testMode: true });
    expect(order.reference).toMatch(/^KT[A-Z2-9]{10}$/);
    const sent = tokenRequests[0]!;
    expect(sent.get('merchant_oid')).toBe(order.reference);
    expect(sent.get('payment_amount')).toBe('9480');
    expect(sent.get('email')).toBe('ayse@example.com');
    expect(sent.get('merchant_ok_url')).toContain(`/app/billing?payment=success&order=${order.id}`);
    // Fatura bilgileri sonraki ödeme için saklanır
    expect((await organizationsRepository.findById(orgId))?.billingName).toBe('Ayşe Yılmaz');

    // Tarayıcı dönüşü paketi açmaz: sadece bildirim
    expect(((await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview).plan).toBeNull();

    const before = Date.now();
    await callback(order.reference, 'success', '9480').expect(200).expect('OK');
    const overview = (await api().get('/api/v1/billing').set(auth(token)).expect(200)).body as BillingOverview;
    expect(overview.plan).toBe('growth');
    expect(overview.planSource).toBe('paid');
    const end = new Date(overview.currentPeriodEnd!).getTime();
    expect(end - before).toBeGreaterThan(27 * 86_400_000);
    expect(end - before).toBeLessThan(32 * 86_400_000);
    expect(overview.orders[0]).toMatchObject({ status: 'paid' });
    const receipt = ctx.mailer.sent.find((m) => m.text.includes(order.reference));
    expect(receipt?.to).toBe('ayse@example.com');
    expect(receipt?.text).toContain(order.reference);

    // Aynı bildirim tekrar: OK, dönem aynı
    await callback(order.reference, 'success', '9480').expect(200).expect('OK');
    const again = (await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview;
    expect(again.currentPeriodEnd).toBe(overview.currentPeriodEnd);

    // Aynı paketin yenilemesi mevcut dönemin sonundan başlar; başka pakete geçiş dönem içinde yok
    const renew = (await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, plan: 'growth', interval: 'monthly', method: 'card' }).expect(201)).body as CheckoutResponse;
    await callback(renew.order.reference, 'success', '9480').expect(200);
    const renewed = (await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview;
    expect(renewed.orders[0]!.periodStart).toBe(overview.currentPeriodEnd);
    const res2 = await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, plan: 'agency', interval: 'monthly', method: 'card' }).expect(409);
    expect(res2.body.error.code).toBe('plan_change_unavailable');
  });

  it('imzası yanlış bildirim reddedilir; başarısız ödeme ve eksik tutar paketi açmaz', async () => {
    const { token } = await signup();
    const { order } = (await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, country: 'DE', plan: 'starter', interval: 'monthly', method: 'card' }).expect(201)).body as CheckoutResponse;
    // Yurt dışı: KDV yok
    expect(order).toMatchObject({ vatCents: 0, totalCents: 3900 });

    await api().post('/api/v1/billing/paytr/callback').type('form').send({ merchant_oid: order.reference, status: 'success', total_amount: '3900', hash: 'sahte' }).expect(400);
    // Tarayıcıda açılırsa giriş hatası değil, açıklama
    const get = await api().get('/api/v1/billing/paytr/callback').expect(405);
    expect(get.text).toContain('POST');
    // Tutar eksik: OK döner (PayTR tekrarlamasın) ama paket açılmaz
    await callback(order.reference, 'success', '100').expect(200).expect('OK');
    let overview = (await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview;
    expect(overview.plan).toBeNull();
    expect(overview.orders[0]).toMatchObject({ status: 'failed' });

    const second = (await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, country: 'DE', plan: 'starter', interval: 'monthly', method: 'card' }).expect(201)).body as CheckoutResponse;
    await callback(second.order.reference, 'failed', '3900', { failed_reason_code: '0', failed_reason_msg: 'Yetersiz bakiye' }).expect(200).expect('OK');
    overview = (await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview;
    expect(overview.plan).toBeNull();
    expect(overview.orders[0]).toMatchObject({ id: second.order.id, status: 'failed' });
  });

  it('PayTR formu açılamazsa sipariş başarısız olur, anlaşılır hata döner', async () => {
    const { token } = await signup();
    ctx.setFetch((async () => new Response(JSON.stringify({ status: 'failed', reason: 'Zorunlu alan degeri gecersiz: user_ip' }))) as typeof fetch);
    const res = await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, plan: 'growth', interval: 'yearly', method: 'card' }).expect(502);
    expect(res.body.error.code).toBe('payment_provider_error');
    const overview = (await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview;
    expect(overview.orders[0]).toMatchObject({ status: 'failed', interval: 'yearly' });
  });
});

describe('kart: TL tahsilat (PayTR hesabında USD yok)', () => {
  it('USD fiyat TCMB kuruyla TL’ye çevrilir, PayTR’ye TL gider, bildirim TL tutarıyla paketi açar', async () => {
    const tl = createTestContext({ ...PAYTR, PAYTR_CURRENCY: 'TL', BILLING_VAT_RATE: '20' });
    tl.setFetch(fakeFetch);
    try {
      const s = (await request(tl.app).post('/api/v1/auth/signup').send({ email: 'tl@example.com', name: 'TL', password: 'long-enough-password' }).expect(201)).body as AuthResponse;
      const overview = (await request(tl.app).get('/api/v1/billing').set(auth(s.accessToken))).body as BillingOverview;
      expect(overview.cardCurrency).toBe('TRY');
      const { order } = (await request(tl.app).post('/api/v1/billing/checkout').set(auth(s.accessToken)).send({ ...billingInfo, plan: 'growth', interval: 'monthly', method: 'card' }).expect(201)).body as CheckoutResponse;
      // $79 + %20 = $94,80 → × 40 = 3.792 TL
      expect(order).toMatchObject({ totalCents: 9480, transferCurrency: 'TRY', exchangeRate: 40, transferAmountMinor: 379200 });
      const sent = tokenRequests.at(-1)!;
      expect(sent.get('currency')).toBe('TL');
      expect(sent.get('payment_amount')).toBe('379200');
      // Geliştirme/testte istek localhost'tan: PayTR'ye makinenin genel IP'si gider
      expect(sent.get('user_ip')).toBe('85.1.2.3');

      const send = (amount: string) =>
        request(tl.app)
          .post('/api/v1/billing/paytr/callback')
          .type('form')
          .send({ merchant_oid: order.reference, status: 'success', total_amount: amount, hash: paytrCallbackHash(paytrCfg, { merchantOid: order.reference, status: 'success', totalAmount: amount }), currency: 'TL', test_mode: '1' });
      await send('379200').expect(200).expect('OK');
      const after = (await request(tl.app).get('/api/v1/billing').set(auth(s.accessToken))).body as BillingOverview;
      expect(after.plan).toBe('growth');
      expect(after.orders[0]).toMatchObject({ status: 'paid' });
    } finally {
      await tl.close();
    }
  });
});

describe('havale / EFT', () => {
  async function adminToken(): Promise<string> {
    const res = await api().post('/api/v1/auth/signup').send({ email: 'admin@example.com', name: 'Admin', password: 'long-enough-password' }).expect(201);
    const body = res.body as AuthResponse;
    await usersRepository.update(body.user.id, { isSuperadmin: true });
    return body.accessToken;
  }

  it('TL hesabına: TCMB kuruyla tutar; yöneticiye bildirim; admin onayıyla paket açılır', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/api/v1/billing/checkout')
      .set(auth(token))
      .send({ ...billingInfo, plan: 'starter', interval: 'yearly', method: 'bank_transfer', transferCurrency: 'TRY' })
      .expect(201);
    const { order, iframeUrl } = res.body as CheckoutResponse;
    expect(iframeUrl).toBeNull();
    // $390 + %20 = $468 → 468 × 40 TL = 18.720 TL (kuruş)
    expect(order).toMatchObject({ method: 'bank_transfer', status: 'pending', totalCents: 46800, transferCurrency: 'TRY', exchangeRate: 40, transferAmountMinor: 1872000 });
    expect(((await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview).pendingTransfer?.id).toBe(order.id);
    const notice = ctx.mailer.sent.find((m) => m.to === 'owner@kitisel.com');
    expect(notice?.subject).toContain(order.reference);
    expect(notice?.replyTo).toBe('ayse@example.com');

    const admin = await adminToken();
    const list = (await api().get('/api/v1/admin/billing/orders?status=pending').set(auth(admin)).expect(200)).body as Page<AdminBillingOrder>;
    expect(list.items.map((o) => o.reference)).toEqual([order.reference]);
    expect(list.items[0]).toMatchObject({ billingName: 'Ayşe Yılmaz', organizationName: expect.any(String) });
    expect(((await api().get('/api/v1/admin/billing/orders/pending-count').set(auth(admin))).body as { count: number }).count).toBe(1);

    // Normal kullanıcı admin uç noktasına erişemez
    await api().post(`/api/v1/admin/billing/orders/${order.id}/approve`).set(auth(token)).send({}).expect(403);

    const approved = (await api().post(`/api/v1/admin/billing/orders/${order.id}/approve`).set(auth(admin)).send({ note: 'Garanti hesabına geçti' }).expect(200)).body as AdminBillingOrder;
    expect(approved).toMatchObject({ status: 'paid', adminNote: 'Garanti hesabına geçti' });
    const overview = (await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview;
    expect(overview.plan).toBe('starter');
    const days = (new Date(overview.currentPeriodEnd!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(360);
    // Onaylanmış sipariş tekrar onaylanamaz
    await api().post(`/api/v1/admin/billing/orders/${order.id}/approve`).set(auth(admin)).send({}).expect(409);
  });

  it('müşteri bekleyen havaleden vazgeçebilir; kart siparişi admin tarafından onaylanamaz', async () => {
    const { token } = await signup();
    const { order } = (await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, plan: 'growth', interval: 'monthly', method: 'bank_transfer', transferCurrency: 'USD' }).expect(201)).body as CheckoutResponse;
    expect(order).toMatchObject({ transferCurrency: 'USD', exchangeRate: null, transferAmountMinor: null });
    await api().post(`/api/v1/billing/orders/${order.id}/cancel`).set(auth(token)).expect(200);
    expect(((await api().get('/api/v1/billing').set(auth(token))).body as BillingOverview).pendingTransfer).toBeNull();
    await api().post(`/api/v1/billing/orders/${order.id}/cancel`).set(auth(token)).expect(409);

    const cardOrder = ((await api().post('/api/v1/billing/checkout').set(auth(token)).send({ ...billingInfo, plan: 'growth', interval: 'monthly', method: 'card' }).expect(201)).body as CheckoutResponse).order;
    const admin = await adminToken();
    await api().post(`/api/v1/admin/billing/orders/${cardOrder.id}/approve`).set(auth(admin)).send({}).expect(409);
  });

  it('başka organizasyonun siparişi görülemez', async () => {
    const a = await signup('a@example.com');
    const b = await signup('b@example.com');
    const { order } = (await api().post('/api/v1/billing/checkout').set(auth(a.token)).send({ ...billingInfo, plan: 'growth', interval: 'monthly', method: 'bank_transfer', transferCurrency: 'USD' }).expect(201)).body as CheckoutResponse;
    await api().get(`/api/v1/billing/orders/${order.id}`).set(auth(b.token)).expect(404);
    await api().post(`/api/v1/billing/orders/${order.id}/cancel`).set(auth(b.token)).expect(404);
  });
});
