import { Cookie } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Button } from '@upvine/ui';
import { consentCookie, loadAnalytics, OPEN_CONSENT_EVENT, readConsent, revokeAnalytics, trackPageView } from '../../lib/analytics';
import type { Consent } from '../../lib/analytics';

/**
 * Analitik çerez onayı (KVKK/GDPR): seçim yapılana kadar alt bantta. "Kabul et" ve "Reddet" eşit ağırlıkta;
 * kabul edilmeden Google Analytics yüklenmez. Ölçüm kimliği yoksa hiçbir şey göstermez.
 */
export function AnalyticsConsent({ measurementId, locale }: { measurementId: string | null; locale: string }) {
  const { t } = useTranslation('common');
  const location = useLocation();
  const [consent, setConsent] = useState<Consent | null>(null);
  const [open, setOpen] = useState(false);

  // Sunucuda bant gösterilmez (hydration uyumu); seçim tarayıcıda çerezden okunur
  useEffect(() => {
    if (!measurementId) return;
    const stored = readConsent(document.cookie);
    setConsent(stored);
    setOpen(stored === null);
    if (stored === 'granted') loadAnalytics(measurementId);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, [measurementId]);

  // Her sayfa geçişinde (istemci tarafı gezinme dahil) bir görüntüleme
  useEffect(() => {
    if (consent === 'granted') trackPageView(location.pathname + location.search);
  }, [consent, location.pathname, location.search]);

  if (!measurementId || !open) return null;

  const choose = (value: Consent) => {
    document.cookie = consentCookie(value, window.location.protocol === 'https:');
    if (value === 'granted') loadAnalytics(measurementId);
    else revokeAnalytics();
    setConsent(value);
    setOpen(false);
  };

  return (
    <section
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface p-4 shadow-popover sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md sm:rounded-card sm:border"
    >
      <div className="flex flex-col gap-3">
        <h2 id="consent-title" className="flex items-center gap-2 text-base font-semibold text-ink">
          <Cookie className="size-5 shrink-0 text-primary" aria-hidden />
          {t('consent.title')}
        </h2>
        <p className="text-sm text-ink-muted">
          {t('consent.body')}{' '}
          <Link to={`/${locale}/legal/cookies`} className="font-medium text-primary hover:underline">
            {t('consent.policy')}
          </Link>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => choose('denied')}>
            {t('consent.reject')}
          </Button>
          <Button variant="secondary" onClick={() => choose('granted')}>
            {t('consent.accept')}
          </Button>
        </div>
      </div>
    </section>
  );
}
