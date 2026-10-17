import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useRevalidator, useRouteLoaderData } from 'react-router';
import { LOCALE_NATIVE_NAMES, LOCALES } from '@upvine/config';
import type { Locale } from '@upvine/config';
import type { Me } from '@upvine/shared';
import { Select } from '@upvine/ui';
import type { loader as rootLoader } from '../root';
import { api } from '../lib/api';
import { authStore } from '../lib/auth-store';
import { applyTheme, isTheme, storeLocale, swapLocaleInPath } from '../lib/preferences';
import type { ThemePreference } from '../lib/preferences';

/** Oturum açıksa tercihi profile de yazar (e-postalar ve diğer cihazlar için). Hata sessizce yutulur. */
function persistToProfile(patch: { locale?: Locale; theme?: ThemePreference }): void {
  const { accessToken, user } = authStore.get();
  if (!accessToken) return;
  // Önce yerelde: panel loader'ı yeniden doğrulamada dili profilden çereze yazar; yanıt gelmeden
  // eski dil seçimi geri alıyordu.
  if (user) authStore.setUser({ ...user, ...patch });
  api<Me>('/me', { method: 'PATCH', body: patch })
    .then((user) => authStore.setUser(user))
    .catch(() => {});
}

/**
 * Dil seçici. Halka açık sayfalarda URL'deki /{locale} değişir (SEO: her dilin kendi URL'i);
 * panelde dil çerezde ve profilde saklanır.
 */
export function LanguageSelect({ mode, className }: { mode: 'public' | 'app'; className?: string }) {
  const { t, i18n } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();

  const onChange = (value: string) => {
    const locale = value as Locale;
    storeLocale(locale);
    persistToProfile({ locale });
    if (mode === 'public') {
      void navigate(swapLocaleInPath(location.pathname, locale) + location.search);
    } else {
      void revalidate();
    }
  };

  return (
    <Select
      aria-label={t('language.label')}
      value={i18n.language}
      onValueChange={onChange}
      options={LOCALES.map((l) => ({ value: l, label: <span lang={l}>{LOCALE_NATIVE_NAMES[l]}</span> }))}
      className={className ?? 'w-auto min-w-36'}
    />
  );
}

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeSelect({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const data = useRouteLoaderData<typeof rootLoader>('root');
  const { revalidate } = useRevalidator();
  const current = data?.theme ?? 'system';

  const onChange = (value: string) => {
    if (!isTheme(value)) return;
    applyTheme(value);
    persistToProfile({ theme: value });
    void revalidate();
  };

  return (
    <Select
      aria-label={t('theme.label')}
      value={current}
      onValueChange={onChange}
      options={(['system', 'light', 'dark'] as const).map((theme) => {
        const Icon = THEME_ICONS[theme];
        return {
          value: theme,
          label: (
            <span className="inline-flex items-center gap-2">
              <Icon className="size-4 text-ink-muted" aria-hidden />
              {t(`theme.${theme}`)}
            </span>
          ),
        };
      })}
      className={className ?? 'w-auto min-w-36'}
    />
  );
}
