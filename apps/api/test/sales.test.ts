import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { salesLeadsRepository, usersRepository } from '@upvine/db';
import type { AuthResponse, SalesImportReport, SalesLeadDetail, SalesLeadPage, SalesPostDto, SalesSummary } from '@upvine/shared';
import { createTestContext } from './helpers';

const ctx = createTestContext();
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86_400_000;

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function signup(email: string): Promise<AuthResponse> {
  return (await api().post('/api/v1/auth/signup').send({ email, name: 'Kişi', password: 'long-enough-password' }).expect(201)).body as AuthResponse;
}

async function adminToken(): Promise<string> {
  const body = await signup('admin@example.com');
  await usersRepository.update(body.user.id, { isSuperadmin: true });
  return body.accessToken;
}

const lead = {
  name: 'Dentapoint Diş Kliniği',
  website: 'https://www.DentaPoint.com.tr/iletisim',
  sector: 'dental',
  city: 'İstanbul · Kadıköy',
  email: 'info@dentapoint.com.tr',
  channel: 'email',
  finding: 'Blog yok.',
  message: 'Konu: Siteniz\n\nMerhaba…\n\n[Adın]',
};

const SEED = {
  leads: [
    { id: 'abguzellik.com', name: 'AB Güzellik', sector: 'Güzellik merkezi', city: 'İstanbul', website: 'https://www.abguzellik.com/', channel: 'Instagram DM', status: 'Yeni', addedAt: '2026-10-27T17:15:00+03:00', finding: 'Bulgu', message: 'Mesaj' },
    { id: 'hukuk.example.com', name: 'Örnek Hukuk', sector: 'Avukat', channel: 'E-posta', status: 'Mesaj gönderildi', addedAt: '2026-10-20T10:00:00+03:00', contactedAt: '2026-10-21T10:00:00+03:00', message: 'Mesaj', followUp: 'Takip' },
    { id: 'yuzyuze.example.com', name: 'Yüz Yüze', sector: 'Yüz yüze görüşme', channel: 'Yüz yüze', status: 'Yeni', addedAt: '2026-10-27T10:00:00+03:00' },
  ],
  posts: [{ id: '2026-10-28-tanisma', date: '2026-10-28', time: '19:30', format: 'Tekli görsel', pillar: 'Tanışma', title: 'Merhaba, ben Kit', status: 'Taslak', caption: 'Açıklama', hashtags: '#seo' }],
};

describe('satış masası: yetki', () => {
  it('oturumsuz 401, normal kullanıcı 403', async () => {
    await api().get('/api/v1/admin/sales/leads').expect(401);
    const user = await signup('user@example.com');
    await api().get('/api/v1/admin/sales/leads').set(auth(user.accessToken)).expect(403);
    await api().post('/api/v1/admin/sales/import').set(auth(user.accessToken)).send(SEED).expect(403);
  });
});

describe('satış masası: adaylar', () => {
  it('elle ekleme: alan adı adresten çıkarılır, aynı alan adı 409 ve mevcut kaydın kimliği', async () => {
    const token = await adminToken();
    const created = (await api().post('/api/v1/admin/sales/leads').set(auth(token)).send(lead).expect(201)).body as SalesLeadDetail;
    expect(created).toMatchObject({ domain: 'dentapoint.com.tr', status: 'new', source: 'manual', contactedAt: null, nextFollowUpAt: null });
    expect(created.events.map((e) => e.type)).toEqual(['created']);

    const dup = await api().post('/api/v1/admin/sales/leads').set(auth(token)).send({ ...lead, website: 'dentapoint.com.tr' }).expect(409);
    expect(dup.body.error).toMatchObject({ code: 'lead_exists', details: { id: created.id } });
  });

  it('durum geçişleri tarihleri doldurur: gönderildi +4 gün, takip +7 gün, ikinci takipten sonra hatırlatma durur, cevap kapatır', async () => {
    const token = await adminToken();
    const { id } = (await api().post('/api/v1/admin/sales/leads').set(auth(token)).send(lead).expect(201)).body as SalesLeadDetail;
    const patch = (body: object) => api().patch(`/api/v1/admin/sales/leads/${id}`).set(auth(token)).send(body).expect(200).then((r) => r.body as SalesLeadDetail);

    const before = Date.now();
    const contacted = await patch({ status: 'contacted' });
    const sentAt = new Date(contacted.contactedAt!).getTime();
    expect(sentAt).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(contacted.nextFollowUpAt!).getTime() - sentAt).toBe(4 * DAY);
    expect(contacted.lastStatusAt).not.toBeNull();
    expect(contacted.events[0]).toMatchObject({ type: 'status_change', fromStatus: 'new', toStatus: 'contacted' });

    const first = await patch({ followUpSent: true });
    expect(first.followUpsSent).toBe(1);
    expect(new Date(first.nextFollowUpAt!).getTime() - Date.now()).toBeGreaterThan(6.9 * DAY);
    const second = await patch({ followUpSent: true });
    expect(second).toMatchObject({ followUpsSent: 2, nextFollowUpAt: null });

    // Gönderim tarihi ikinci kez "gönderildi"de korunur
    await patch({ status: 'new' });
    const again = await patch({ status: 'contacted' });
    expect(again.contactedAt).toBe(contacted.contactedAt);

    const replied = await patch({ status: 'replied' });
    expect(replied.nextFollowUpAt).toBeNull();
    // Takip sadece "mesaj gönderildi" durumunda
    await api().patch(`/api/v1/admin/sales/leads/${id}`).set(auth(token)).send({ followUpSent: true }).expect(409);

    const closed = await patch({ status: 'not_interested', doNotContact: true });
    expect(closed).toMatchObject({ status: 'not_interested', doNotContact: true, nextFollowUpAt: null });
  });

  it('takip zamanı filtresi; "bir daha yazma" varsayılan listede yok; not ve kopyalama geçmişe yazılır', async () => {
    const token = await adminToken();
    const add = async (website: string) => ((await api().post('/api/v1/admin/sales/leads').set(auth(token)).send({ ...lead, name: website, website }).expect(201)).body as SalesLeadDetail).id;
    const dueId = await add('due.example.com');
    const laterId = await add('later.example.com');
    const dncId = await add('dnc.example.com');
    for (const id of [dueId, laterId]) await api().patch(`/api/v1/admin/sales/leads/${id}`).set(auth(token)).send({ status: 'contacted' }).expect(200);
    await salesLeadsRepository.update(dueId, { nextFollowUpAt: new Date(Date.now() - DAY) });
    await api().patch(`/api/v1/admin/sales/leads/${dncId}`).set(auth(token)).send({ doNotContact: true }).expect(200);

    const due = (await api().get('/api/v1/admin/sales/leads?due=1').set(auth(token)).expect(200)).body as SalesLeadPage;
    expect(due.items.map((l) => l.id)).toEqual([dueId]);
    expect(due.items[0]!.followUpDue).toBe(true);

    const all = (await api().get('/api/v1/admin/sales/leads').set(auth(token)).expect(200)).body as SalesLeadPage;
    expect(all.items.map((l) => l.id).sort()).toEqual([dueId, laterId].sort());
    const withDnc = (await api().get('/api/v1/admin/sales/leads?dnc=1').set(auth(token)).expect(200)).body as SalesLeadPage;
    expect(withDnc.items).toHaveLength(3);
    const searched = (await api().get('/api/v1/admin/sales/leads?q=later').set(auth(token)).expect(200)).body as SalesLeadPage;
    expect(searched.items.map((l) => l.id)).toEqual([laterId]);
    const paged = (await api().get('/api/v1/admin/sales/leads?limit=1').set(auth(token)).expect(200)).body as SalesLeadPage;
    expect(paged).toMatchObject({ nextOffset: 1 });

    await api().post(`/api/v1/admin/sales/leads/${dueId}/events`).set(auth(token)).send({ type: 'note', text: 'Pazartesi aranacak' }).expect(201);
    const copied = (await api().post(`/api/v1/admin/sales/leads/${dueId}/events`).set(auth(token)).send({ type: 'message_copied', text: 'message' }).expect(201)).body as SalesLeadDetail;
    expect(copied.events.slice(0, 2).map((e) => [e.type, e.text])).toEqual([
      ['message_copied', 'message'],
      ['note', 'Pazartesi aranacak'],
    ]);
    await api().post(`/api/v1/admin/sales/leads/${dueId}/events`).set(auth(token)).send({ type: 'note', text: '' }).expect(400);

    const summary = (await api().get('/api/v1/admin/sales/leads/summary').set(auth(token)).expect(200)).body as SalesSummary;
    expect(summary).toMatchObject({ total: 2, doNotContact: 1, due: 1, sentThisWeek: 2, addedToday: 3, postsThisWeek: 0, byStatus: { contacted: 2, new: 0 } });
    expect(summary.funnel[0]).toMatchObject({ stage: 'contacted', count: 2, rate: null });

    await api().delete(`/api/v1/admin/sales/leads/${laterId}`).set(auth(token)).expect(204);
    await api().get(`/api/v1/admin/sales/leads/${laterId}`).set(auth(token)).expect(404);
  });

  it('CSV: UTF-8 BOM, noktalı virgül, Türkçe karakter ve formül koruması', async () => {
    const token = await adminToken();
    await api().post('/api/v1/admin/sales/leads').set(auth(token)).send({ ...lead, note: '=HYPERLINK("x")' }).expect(201);
    const res = await api().get('/api/v1/admin/sales/export.csv').set(auth(token)).buffer(true).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const text = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('domain;name;sector');
    expect(text).toContain('Dentapoint Diş Kliniği');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('kayıtlı kullanıcılarla eşleştirme: aynı alan adlı e-posta "deneme başladı" yapar, genel e-posta servisi eşleşmez', async () => {
    const token = await adminToken();
    const { id } = (await api().post('/api/v1/admin/sales/leads').set(auth(token)).send(lead).expect(201)).body as SalesLeadDetail;
    await api().post('/api/v1/admin/sales/leads').set(auth(token)).send({ ...lead, name: 'Gmail', website: 'gmail.com' }).expect(201);
    const user = await signup('dr@dentapoint.com.tr');
    await signup('biri@gmail.com');

    const res = (await api().post('/api/v1/admin/sales/leads/match-users').set(auth(token)).expect(200)).body as { linked: number };
    expect(res.linked).toBe(1);
    const linked = (await api().get(`/api/v1/admin/sales/leads/${id}`).set(auth(token))).body as SalesLeadDetail;
    expect(linked).toMatchObject({ linkedUserId: user.user.id, status: 'trial' });
    expect(linked.events.map((e) => e.type)).toEqual(expect.arrayContaining(['linked', 'status_change']));
  });

  it('eski kayıtları temizle: 12 aydan eski "ilgilenmiyor" adaylar silinir', async () => {
    const token = await adminToken();
    const add = async (website: string) => ((await api().post('/api/v1/admin/sales/leads').set(auth(token)).send({ ...lead, name: website, website }).expect(201)).body as SalesLeadDetail).id;
    const old = await add('old.example.com');
    const recent = await add('recent.example.com');
    for (const id of [old, recent]) await api().patch(`/api/v1/admin/sales/leads/${id}`).set(auth(token)).send({ status: 'not_interested' }).expect(200);
    await salesLeadsRepository.update(old, { lastStatusAt: new Date(Date.now() - 400 * DAY) });
    const res = (await api().post('/api/v1/admin/sales/leads/cleanup').set(auth(token)).expect(200)).body as { removed: number };
    expect(res.removed).toBe(1);
    await api().get(`/api/v1/admin/sales/leads/${old}`).set(auth(token)).expect(404);
    await api().get(`/api/v1/admin/sales/leads/${recent}`).set(auth(token)).expect(200);
  });
});

describe('satış masası: içe aktarma', () => {
  it('önizleme yazmaz; Türkçe değerler çevrilir; tekrar aktarımda atlanır; güncelleme modu sadece boş alanları doldurur', async () => {
    const token = await adminToken();
    const dry = (await api().post('/api/v1/admin/sales/import?dryRun=1').set(auth(token)).send(SEED).expect(200)).body as SalesImportReport;
    expect(dry).toMatchObject({ dryRun: true, leads: { added: ['abguzellik.com', 'hukuk.example.com', 'yuzyuze.example.com'] }, posts: { added: ['2026-10-28-tanisma'] } });
    expect(((await api().get('/api/v1/admin/sales/leads').set(auth(token))).body as SalesLeadPage).items).toHaveLength(0);

    await api().post('/api/v1/admin/sales/import').set(auth(token)).send(SEED).expect(200);
    const list = ((await api().get('/api/v1/admin/sales/leads').set(auth(token))).body as SalesLeadPage).items;
    const by = Object.fromEntries(list.map((l) => [l.domain, l]));
    expect(by['abguzellik.com']).toMatchObject({ sector: 'beauty', channel: 'instagram_dm', status: 'new', source: 'import', addedAt: '2026-10-27T14:15:00.000Z' });
    expect(by['hukuk.example.com']).toMatchObject({ sector: 'lawyer', channel: 'email', status: 'contacted', followUpMessage: 'Takip', contactedAt: '2026-10-21T07:00:00.000Z', nextFollowUpAt: '2026-10-25T07:00:00.000Z' });
    expect(by['yuzyuze.example.com']).toMatchObject({ sector: 'other', channel: 'in_person' });
    const detail = (await api().get(`/api/v1/admin/sales/leads/${by['abguzellik.com']!.id}`).set(auth(token))).body as SalesLeadDetail;
    expect(detail.events.map((e) => e.type)).toEqual(['imported']);
    const posts = ((await api().get('/api/v1/admin/sales/posts').set(auth(token))).body as { items: SalesPostDto[] }).items;
    expect(posts[0]).toMatchObject({ slug: '2026-10-28-tanisma', pillar: 'intro', status: 'draft', time: '19:30', source: 'import' });

    const again = (await api().post('/api/v1/admin/sales/import').set(auth(token)).send(SEED).expect(200)).body as SalesImportReport;
    expect(again.leads).toMatchObject({ added: [], skipped: ['abguzellik.com', 'hukuk.example.com', 'yuzyuze.example.com'] });

    // Admin değişiklikleri: durum, not, "bir daha yazma" — güncelleme modunda korunur, sadece boş alanlar dolar
    const id = by['yuzyuze.example.com']!.id;
    await api().patch(`/api/v1/admin/sales/leads/${id}`).set(auth(token)).send({ status: 'not_interested', doNotContact: true, note: 'Aramayın' }).expect(200);
    const update = { leads: [{ ...SEED.leads[2]!, status: 'Yeni', email: 'info@yuzyuze.example.com', message: 'Yeni mesaj' }] };
    const updated = (await api().post('/api/v1/admin/sales/import?mode=update').set(auth(token)).send(update).expect(200)).body as SalesImportReport;
    expect(updated.leads.updated).toEqual(['yuzyuze.example.com']);
    const after = (await api().get(`/api/v1/admin/sales/leads/${id}`).set(auth(token))).body as SalesLeadDetail;
    expect(after).toMatchObject({ status: 'not_interested', doNotContact: true, note: 'Aramayın', email: 'info@yuzyuze.example.com', message: 'Yeni mesaj' });
  });

  it('geçersiz alan adı raporlanır', async () => {
    const token = await adminToken();
    const res = (await api().post('/api/v1/admin/sales/import').set(auth(token)).send({ leads: [{ id: 'gecersiz', name: 'X' }] }).expect(200)).body as SalesImportReport;
    expect(res.leads.invalid).toEqual(['gecersiz']);
  });
});

describe('satış masası: Instagram planı', () => {
  it('ekle, tarih aralığıyla listele, güncelle (durum korunur), tekrar eden slug 409, sil', async () => {
    const token = await adminToken();
    const post = { slug: '2026-10-29-egitim', date: '2026-10-29', time: '12:00', format: 'Carousel (5 slayt)', pillar: 'education', title: 'Blog neden önemli?', status: 'approved' };
    const created = (await api().post('/api/v1/admin/sales/posts').set(auth(token)).send(post).expect(201)).body as SalesPostDto;
    expect(created).toMatchObject({ slug: post.slug, status: 'approved', source: 'manual' });
    await api().post('/api/v1/admin/sales/posts').set(auth(token)).send(post).expect(409);

    expect((await api().get(`/api/v1/admin/sales/posts/${created.id}`).set(auth(token)).expect(200)).body).toMatchObject({ id: created.id, slug: created.slug });
    const updated = (await api().patch(`/api/v1/admin/sales/posts/${created.id}`).set(auth(token)).send({ caption: 'Yeni açıklama' }).expect(200)).body as SalesPostDto;
    expect(updated).toMatchObject({ caption: 'Yeni açıklama', status: 'approved' });

    const inRange = (await api().get('/api/v1/admin/sales/posts?from=2026-10-27&to=2026-11-02').set(auth(token))).body as { items: SalesPostDto[] };
    expect(inRange.items).toHaveLength(1);
    const outRange = (await api().get('/api/v1/admin/sales/posts?from=2026-11-03&to=2026-11-09').set(auth(token))).body as { items: SalesPostDto[] };
    expect(outRange.items).toHaveLength(0);

    await api().post('/api/v1/admin/sales/posts').set(auth(token)).send({ ...post, slug: 'Boşluklu Slug' }).expect(400);
    await api().delete(`/api/v1/admin/sales/posts/${created.id}`).set(auth(token)).expect(204);
    await api().get(`/api/v1/admin/sales/posts/${created.id}`).set(auth(token)).expect(404);
  });
});
