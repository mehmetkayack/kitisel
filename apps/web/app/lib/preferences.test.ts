import { describe, expect, it } from 'vitest';
import { safeNext } from '../components/auth-ui';
import { parseCookies, preferencesFromRequest, swapLocaleInPath } from './preferences';

describe('swapLocaleInPath', () => {
  it('URL’deki dili değiştirir, yoksa ekler', () => {
    expect(swapLocaleInPath('/de/login', 'fr')).toBe('/fr/login');
    expect(swapLocaleInPath('/en', 'tr')).toBe('/tr');
    expect(swapLocaleInPath('/pricing', 'es')).toBe('/es/pricing');
  });
});

describe('preferencesFromRequest', () => {
  it('çerezdeki seçim Accept-Language’den önce gelir', () => {
    const req = new Request('http://x/', {
      headers: { cookie: 'upvine_locale=tr; upvine_theme=dark', 'accept-language': 'de' },
    });
    expect(preferencesFromRequest(req)).toEqual({ locale: 'tr', theme: 'dark' });
  });

  it('çerez yoksa tarayıcı dilini kullanır, geçersiz temayı yok sayar', () => {
    const req = new Request('http://x/', { headers: { cookie: 'upvine_theme=neon', 'accept-language': 'fr-CA,fr' } });
    expect(preferencesFromRequest(req)).toEqual({ locale: 'fr', theme: 'system' });
  });
});

describe('parseCookies', () => {
  it('bozuk değerlerde çökmez', () => {
    expect(parseCookies('a=1; b=%E0%A4%A; c=3')).toEqual({ a: '1', c: '3' });
  });
});

describe('safeNext (açık yönlendirme koruması)', () => {
  it('sadece panel içi yollara izin verir', () => {
    expect(safeNext('/app/settings')).toBe('/app/settings');
    expect(safeNext('https://evil.example')).toBe('/app');
    expect(safeNext('//evil.example')).toBe('/app');
    expect(safeNext('/application')).toBe('/app');
    expect(safeNext(null)).toBe('/app');
  });
});
