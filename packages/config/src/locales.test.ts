import { describe, expect, it } from 'vitest';
import { isLocale, pickLocale } from './locales';

describe('pickLocale', () => {
  it('Accept-Language önceliğine göre desteklenen ilk dili seçer', () => {
    expect(pickLocale('de-CH,de;q=0.9,en;q=0.8')).toBe('de');
    expect(pickLocale('ja,fr;q=0.8,en;q=0.5')).toBe('fr');
    expect(pickLocale('en;q=0.2,tr;q=0.9')).toBe('tr');
  });

  it('desteklenmeyen ya da boş başlıkta varsayılan dile düşer', () => {
    expect(pickLocale('ja,zh;q=0.8')).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
    expect(pickLocale('')).toBe('en');
  });
});

describe('isLocale', () => {
  it('sadece 5 arayüz dilini kabul eder', () => {
    expect(isLocale('tr')).toBe(true);
    expect(isLocale('it')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
