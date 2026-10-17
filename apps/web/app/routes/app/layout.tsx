import { useMutation } from '@tanstack/react-query';
import { CalendarDays, Eye, FileText, House, LogOut, Settings, ShieldCheck, TrendingUp, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, redirect, useNavigate } from 'react-router';
import {
  Alert,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  toast,
} from '@upvine/ui';
import type { Route } from './+types/layout';
import { KitiselLogo } from '../../components/brand/kitisel-logo';
import { brandLinks } from '../../components/brand/links';
import { LanguageSelect, ThemeSelect } from '../../components/preference-controls';
import { api, ApiError, logout, refreshSession } from '../../lib/api';
import { authStore, useAuth, useCurrentUser } from '../../lib/auth-store';
import { clientLocale, storeLocale } from '../../lib/preferences';

/**
 * Panel sadece istemcide çalışır (sunucu loader'ı yok). Access token yoksa refresh çereziyle
 * oturum yenilenir; o da yoksa giriş sayfasına yönlendirilir.
 */
export const links: Route.LinksFunction = brandLinks;

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  if (!authStore.get().accessToken && !(await refreshSession())) {
    const url = new URL(request.url);
    throw redirect(`/${clientLocale()}/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const user = authStore.get().user;
  if (user) storeLocale(user.locale);
  return null;
}

/** Panel yüklenirken boş beyaz ekran yerine iskelet (Bölüm 6.5 madde 7). */
export function HydrateFallback() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 border-r border-border bg-surface p-4 md:block">
        <Skeleton className="mb-8 h-10 w-32" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="mb-2 h-11 w-full" />
        ))}
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-9 w-48" />
        <Skeleton className="h-48 w-full max-w-3xl" />
      </div>
    </div>
  );
}

interface NavItem {
  to: string;
  key: 'home' | 'content' | 'calendar' | 'results' | 'settings';
  icon: LucideIcon;
  end?: boolean;
}

/** En fazla 5 ana menü öğesi (Bölüm 6.5 madde 3). */
const NAV: NavItem[] = [
  { to: '/app', key: 'home', icon: House, end: true },
  { to: '/app/content', key: 'content', icon: FileText },
  { to: '/app/calendar', key: 'calendar', icon: CalendarDays },
  { to: '/app/results', key: 'results', icon: TrendingUp },
  { to: '/app/settings', key: 'settings', icon: Settings },
];

export default function AppLayout() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  // Çıkış sırasında oturum temizlenir ve yönlendirme biter bitmez bu düzen kaldırılır;
  // aradaki tek render'da kullanıcıya bağlı bileşenler çalışmasın.
  if (!user) return <HydrateFallback />;
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('skipToContent')}
      </a>

      {/* Masaüstü yan menü */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
        <KitiselLogo to="/app" className="mb-6 px-2" />
        <nav aria-label={t('nav.label')}>
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150',
                      isActive ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                    )
                  }
                >
                  <item.icon className="size-5" aria-hidden />
                  {t(`nav.${item.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur sm:px-6">
          <KitiselLogo to="/app" className="md:hidden" />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <LanguageSelect mode="app" />
              <ThemeSelect />
            </div>
            <UserMenu />
          </div>
        </header>

        <main id="main" className="flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-10">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <ImpersonationBanner />
            <VerifyEmailBanner />
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobil alt navigasyon (375 px'te tam çalışır) */}
      <nav
        aria-label={t('nav.label')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.map((item) => (
            <li key={item.key}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight font-medium',
                    isActive ? 'text-primary' : 'text-ink-muted',
                  )
                }
              >
                <item.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate">{t(`nav.${item.key}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function UserMenu() {
  const { t } = useTranslation('common');
  const tApp = useTranslation('app').t;
  const user = useCurrentUser();
  const { impersonating } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await logout();
    await navigate(`/${user.locale}/login`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={tApp('userMenu.label')}>
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {user.name.trim().charAt(0).toLocaleUpperCase(user.locale) || <UserRound aria-hidden />}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block truncate font-medium text-ink">{user.name}</span>
          <span className="block truncate text-ink-muted">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/settings">
            <Settings aria-hidden />
            {tApp('userMenu.settings')}
          </Link>
        </DropdownMenuItem>
        {user.isSuperadmin && !impersonating ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheck aria-hidden />
              {tApp('userMenu.admin')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          {t('actions.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VerifyEmailBanner() {
  const { t } = useTranslation('app');
  const user = useCurrentUser();
  const resend = useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST' }),
    onSuccess: () => toast.success(t('verifyBanner.sent')),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });
  if (user.emailVerified) return null;
  return (
    <Alert
      tone="warning"
      action={
        <Button variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>
          {t('verifyBanner.resend')}
        </Button>
      }
    >
      {t('verifyBanner.text', { email: user.email })}
    </Alert>
  );
}

/**
 * Admin "kullanıcının gözünden görüntüleme" modunda her sayfada görünür (salt okunur).
 * Çıkış: refresh çereziyle admin oturumu geri alınır ve kullanıcının admin detayına dönülür.
 */
function ImpersonationBanner() {
  const { t } = useTranslation('app');
  const { impersonating } = useAuth();
  const navigate = useNavigate();
  const exit = useMutation({
    mutationFn: async () => {
      const id = impersonating?.id;
      await refreshSession();
      await navigate(id ? `/admin/users/${id}` : '/admin');
    },
  });
  if (!impersonating) return null;
  return (
    <Alert
      tone="warning"
      action={
        <Button variant="secondary" loading={exit.isPending} onClick={() => exit.mutate()}>
          <Eye aria-hidden />
          {t('impersonation.exit')}
        </Button>
      }
    >
      {t('impersonation.text', { name: impersonating.name, email: impersonating.email })}
    </Alert>
  );
}
