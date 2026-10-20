import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bot,
  Building2,
  CreditCard,
  Flag,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Menu,
  Newspaper,
  ReceiptText,
  ScrollText,
  Undo2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, NavLink, Outlet, redirect } from 'react-router';
import { Button, cn, Sheet, SheetContent, SheetTrigger, Skeleton } from '@upvine/ui';
import type { Route } from './+types/layout';
import { Logo } from '../../components/logo';
import { LanguageSelect, ThemeSelect } from '../../components/preference-controls';
import { api, refreshSession } from '../../lib/api';
import { authStore } from '../../lib/auth-store';
import { clientLocale, storeLocale } from '../../lib/preferences';

/**
 * Admin paneli: sadece istemci, sadece superadmin (Bölüm 7.16). Görüntüleme modundaysa
 * (access token başka kullanıcınınsa) önce admin oturumuna dönülür.
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const s = authStore.get();
  if ((!s.accessToken || s.impersonating) && !(await refreshSession())) {
    const url = new URL(request.url);
    throw redirect(`/${clientLocale()}/login?next=${encodeURIComponent(url.pathname)}`);
  }
  const user = authStore.get().user;
  if (!user?.isSuperadmin) throw data(null, { status: 404 });
  storeLocale(user.locale);
  return null;
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 border-r border-border bg-surface p-4 lg:block">
        <Skeleton className="mb-8 h-10 w-32" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="mb-2 h-11 w-full" />
        ))}
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-9 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

interface NavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  end?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: '/admin', key: 'overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', key: 'users', icon: Users },
  { to: '/admin/organizations', key: 'organizations', icon: Building2 },
  { to: '/admin/audit', key: 'audit', icon: ScrollText },
  { to: '/admin/messages', key: 'messages', icon: Inbox },
  { to: '/admin/blog', key: 'blog', icon: Newspaper },
];

/** Verisi sonraki fazlarda gelecek bölümler (spec Bölüm 8 admin rotaları) */
const SOON_NAV: NavItem[] = [
  { to: '/admin/billing', key: 'billing', icon: CreditCard },
  { to: '/admin/refunds', key: 'refunds', icon: Undo2 },
  { to: '/admin/invoices', key: 'invoices', icon: ReceiptText },
  { to: '/admin/queues', key: 'queues', icon: ListChecks },
  { to: '/admin/ai-costs', key: 'aiCosts', icon: Bot },
  { to: '/admin/flags', key: 'flags', icon: Flag },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation('admin');
  // Okunmamış iletişim mesajı sayısı (dakikada bir yenilenir)
  const unread = useQuery({
    queryKey: ['admin', 'contact-unread'],
    queryFn: () => api<{ count: number }>('/admin/contact-messages/unread-count'),
    refetchInterval: 60_000,
  });
  const unreadCount = unread.data?.count ?? 0;
  const link = (item: NavItem) => (
    <li key={item.key}>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150',
            isActive ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
          )
        }
      >
        <item.icon className="size-5 shrink-0" aria-hidden />
        {t(`nav.${item.key}`)}
        {item.key === 'messages' && unreadCount > 0 ? (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">
            {unreadCount}
            <span className="sr-only"> {t('messages.unreadSr')}</span>
          </span>
        ) : null}
      </NavLink>
    </li>
  );
  return (
    <nav aria-label={t('nav.label')} className="flex flex-col gap-6">
      <ul className="flex flex-col gap-1">{MAIN_NAV.map(link)}</ul>
      <div>
        <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">{t('nav.soon')}</p>
        <ul className="flex flex-col gap-1">{SOON_NAV.map(link)}</ul>
      </div>
    </nav>
  );
}

export default function AdminLayout() {
  const { t } = useTranslation('admin');
  const tCommon = useTranslation('common').t;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2"
      >
        {tCommon('skipToContent')}
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface px-3 py-4 lg:flex">
        <div className="flex items-center gap-2 px-2">
          <Logo to="/admin" />
          <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-background">{t('title')}</span>
        </div>
        <NavList />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur sm:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t('menu')}>
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent title={t('title')} className="max-w-xs">
              <NavList onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <Button asChild variant="ghost">
            <Link to="/app" aria-label={t('backToApp')}>
              <ArrowLeft aria-hidden />
              <span className="hidden sm:inline">{t('backToApp')}</span>
            </Link>
          </Button>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <LanguageSelect mode="app" />
            <ThemeSelect />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
