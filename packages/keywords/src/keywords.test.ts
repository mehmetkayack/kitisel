import { describe, expect, it } from 'vitest';
import { createKeywordProvider, dataForSeoLocationCode, DataForSeoProvider, KeywordProviderError } from './index';

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('DataForSEO', () => {
  it('konum kodu = 2000 + ISO sayısal kod', () => {
    expect(dataForSeoLocationCode('TR')).toBe(2792);
    expect(dataForSeoLocationCode('us')).toBe(2840);
    expect(dataForSeoLocationCode('XX')).toBeNull();
  });

  it('keyword_overview isteği ve yanıtın eşlenmesi', async () => {
    const { impl, calls } = fakeFetch({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          cost: 0.0101,
          result: [
            {
              items: [
                { keyword: 'implant tedavisi süresi', keyword_info: { search_volume: 1300, cpc: 0.42 }, keyword_properties: { keyword_difficulty: 23 }, search_intent_info: { main_intent: 'informational' } },
                { keyword: 'diş beyazlatma', keyword_info: { search_volume: null }, search_intent_info: { main_intent: 'other' } },
              ],
            },
          ],
        },
      ],
    });
    const provider = new DataForSeoProvider({ login: 'l', password: 'p' }, impl);
    const res = await provider.metrics(['İmplant tedavisi süresi', 'diş beyazlatma', 'diş beyazlatma'], { language: 'tr', country: 'TR' });
    expect(res.costUsd).toBe(0.0101);
    expect(res.items).toEqual([
      { keyword: 'implant tedavisi süresi', searchVolume: 1300, difficulty: 23, cpc: 0.42, intent: 'informational' },
      { keyword: 'diş beyazlatma', searchVolume: null, difficulty: null, cpc: null, intent: null },
    ]);
    expect(calls[0]!.url).toBe('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('l:p').toString('base64')}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual([{ keywords: ['implant tedavisi süresi', 'diş beyazlatma'], location_code: 2792, language_code: 'tr' }]);
  });

  it('ülke yoksa istek atılmaz; görev hatası anlaşılır hata; anahtar yoksa sağlayıcı kapalı', async () => {
    const { impl, calls } = fakeFetch({ tasks: [{ status_code: 40501, status_message: 'Invalid Field' }] });
    const provider = new DataForSeoProvider({ login: 'l', password: 'p' }, impl);
    expect(await provider.metrics(['x y'], { language: 'tr', country: null })).toEqual({ items: [], costUsd: 0 });
    expect(calls).toHaveLength(0);
    await expect(provider.metrics(['x y'], { language: 'tr', country: 'TR' })).rejects.toBeInstanceOf(KeywordProviderError);
    expect(createKeywordProvider({}).configured).toBe(false);
    expect(createKeywordProvider({ DATAFORSEO_LOGIN: 'a', DATAFORSEO_PASSWORD: 'b' }).configured).toBe(true);
  });
});
