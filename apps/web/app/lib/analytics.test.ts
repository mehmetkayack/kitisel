import { describe, expect, it } from 'vitest';
import { consentCookie, MEASUREMENT_ID, readConsent } from './analytics';

describe('çerez onayı', () => {
  it('onay çerezini okur; yoksa ya da geçersizse null', () => {
    expect(readConsent('upvine_locale=tr; upvine_consent=granted')).toBe('granted');
    expect(readConsent('upvine_consent=denied')).toBe('denied');
    expect(readConsent('upvine_consent=maybe; x=1')).toBeNull();
    expect(readConsent('')).toBeNull();
  });

  it('çerez 6 ay geçerli, https\'te Secure', () => {
    expect(consentCookie('granted', true)).toBe('upvine_consent=granted; Max-Age=15552000; Path=/; SameSite=Lax; Secure');
    expect(consentCookie('denied', false)).not.toContain('Secure');
  });

  it('sadece GA4 ölçüm kimliği kabul edilir', () => {
    expect(MEASUREMENT_ID.test('G-X9CB4S8B3B')).toBe(true);
    expect(MEASUREMENT_ID.test('UA-12345-1')).toBe(false);
    expect(MEASUREMENT_ID.test('G-<script>')).toBe(false);
  });
});
