import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { blogPostsRepository, credentialsRepository, sitesRepository, usersRepository } from '@upvine/db';
import { decryptJson } from '@upvine/publishers';
import type { StoredCredentials } from '@upvine/publishers';
import type { AdminBlogPost, AuthResponse, ConnectionDto, SiteDto } from '@upvine/shared';
import { createTestContext } from './helpers';

const ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
const ctx = createTestContext({ WEB_URL: 'https://kitisel.example', ENCRYPTION_KEY });
const api = () => request(ctx.app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signup(superadmin: boolean) {
  const res = (await api().post('/api/v1/auth/signup').send({ email: `u${Date.now()}${Math.random()}@example.com`, name: 'Test', password: 'long-enough-password' }).expect(201)).body as AuthResponse;
  if (superadmin) await usersRepository.update(res.user.id, { isSuperadmin: true });
  return { token: res.accessToken, orgId: res.user.organizations[0]!.id };
}

async function addSite(token: string, url: string, contentLanguage?: string) {
  const site = (await api().post('/api/v1/sites').set(auth(token)).send({ url }).expect(201)).body as SiteDto;
  if (contentLanguage) await api().patch(`/api/v1/sites/${site.id}`).set(auth(token)).send({ contentLanguage }).expect(200);
  return site;
}

const connection = async (token: string, siteId: string) =>
  (await api().get(`/api/v1/sites/${siteId}/connection`).set(auth(token)).expect(200)).body as { connection: ConnectionDto | null; internalBlogAvailable: boolean };

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

describe('Kitisel blogu bağlantısı', () => {
  it('sadece superadmin ve sadece Kitisel\'in sitesine (WEB_URL) kurulur', async () => {
    const user = await signup(false);
    const userSite = await addSite(user.token, 'www.kitisel.example', 'tr');
    expect((await connection(user.token, userSite.id)).internalBlogAvailable).toBe(false);
    await api().put(`/api/v1/sites/${userSite.id}/connection/kitisel`).set(auth(user.token)).expect(403);

    const admin = await signup(true);
    const other = await addSite(admin.token, 'baska-site.example', 'tr');
    expect((await connection(admin.token, other.id)).internalBlogAvailable).toBe(false);
    await api().put(`/api/v1/sites/${other.id}/connection/kitisel`).set(auth(admin.token)).expect(403);
    expect(await credentialsRepository.findForSite(admin.orgId, other.id)).toBeNull();
  });

  it('içerik dili arayüz dillerinden biri olmalı; bağlanınca gizli bilgi olmadan saklanır', async () => {
    const admin = await signup(true);
    const site = await addSite(admin.token, 'kitisel.example', 'it');
    expect((await connection(admin.token, site.id)).internalBlogAvailable).toBe(true);
    const bad = await api().put(`/api/v1/sites/${site.id}/connection/kitisel`).set(auth(admin.token)).expect(422);
    expect(bad.body.error.code).toBe('internal_blog_language');

    await sitesRepository.update(admin.orgId, site.id, { contentLanguage: 'tr' });
    const res = await api().put(`/api/v1/sites/${site.id}/connection/kitisel`).set(auth(admin.token)).expect(200);
    expect(res.body).toMatchObject({ kind: 'kitisel', display: { blog: 'https://kitisel.example/tr/blog' } });

    const rec = (await credentialsRepository.findForSite(admin.orgId, site.id))!;
    const creds = decryptJson<StoredCredentials>({ ciphertext: rec.ciphertext, iv: rec.iv, authTag: rec.authTag, keyVersion: rec.keyVersion }, { 1: ENCRYPTION_KEY });
    expect(creds).toEqual({ kind: 'kitisel', webUrl: 'https://kitisel.example', locale: 'tr' });
    expect((await sitesRepository.findById(admin.orgId, site.id))?.cmsType).toBe('kitisel');

    // Bağlantı testi gizli bilgi istemez
    await api().post(`/api/v1/sites/${site.id}/connection/test`).set(auth(admin.token)).expect(200);
  });
});

describe('admin blog: yazım hattının dil sürümleri', () => {
  it('ayrıntıda diğer dil taslakları listelenir; elle yazılan yazıda liste boş', async () => {
    const admin = await signup(true);
    const base = { excerpt: 'Kısa özet metni burada duruyor.', bodyHtml: '<p>Metin</p>', metaTitle: null, metaDescription: null, status: 'draft' as const, publishedAt: null, readingMinutes: 1, cover: null };
    const source = await blogPostsRepository.createFromPipeline({ ...base, locale: 'tr', slug: 'kaynak-yazi', title: 'Kaynak yazı', translationGroupId: null });
    expect(source.translationGroupId).toBe(source.id);
    const en = await blogPostsRepository.createFromPipeline({ ...base, locale: 'en', slug: 'source-post', title: 'Source post', translationGroupId: source.id });

    const detail = (await api().get(`/api/v1/admin/blog-posts/${source.id}`).set(auth(admin.token)).expect(200)).body as AdminBlogPost;
    expect(detail.origin).toBe('pipeline');
    expect(detail.translations).toEqual([{ id: en.id, locale: 'en', title: 'Source post', status: 'draft' }]);

    expect(await blogPostsRepository.freeSlug('tr', 'kaynak-yazi')).toBe('kaynak-yazi-2');
    expect(await blogPostsRepository.freeSlug('en', 'kaynak-yazi')).toBe('kaynak-yazi');
  });
});
