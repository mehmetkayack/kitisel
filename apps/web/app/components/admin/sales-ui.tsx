import { AlarmClock, BadgeCheck, Ban, CalendarCheck, CheckCircle2, CircleDot, Clock, FileEdit, FlaskConical, Globe, Reply, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import type { SalesLeadStatusValue, SalesPostStatusValue } from '@upvine/shared';
import type { ComponentProps } from 'react';
import { Badge, cn, toast } from '@upvine/ui';
import { authStore, useAuth } from '../../lib/auth-store';
import { refreshSession } from '../../lib/api';

type Tone = NonNullable<ComponentProps<typeof Badge>['tone']>;

const LEAD_STATUS: Record<SalesLeadStatusValue, { tone: Tone; icon: LucideIcon }> = {
  new: { tone: 'neutral', icon: CircleDot },
  contacted: { tone: 'info', icon: Send },
  replied: { tone: 'info', icon: Reply },
  meeting: { tone: 'primary', icon: CalendarCheck },
  trial: { tone: 'success', icon: FlaskConical },
  customer: { tone: 'success', icon: BadgeCheck },
  not_interested: { tone: 'neutral', icon: Ban },
};

/** Aday durumu: renk + ikon + metin */
export function LeadStatusBadge({ status }: { status: SalesLeadStatusValue }) {
  const { t } = useTranslation('admin');
  const s = LEAD_STATUS[status];
  return (
    <Badge tone={s.tone}>
      <s.icon aria-hidden />
      {t(`sales.status.${status}`)}
    </Badge>
  );
}

export function FollowUpDueBadge() {
  const { t } = useTranslation('admin');
  return (
    <Badge tone="warning">
      <AlarmClock aria-hidden />
      {t('sales.followUpDue')}
    </Badge>
  );
}

export function DoNotContactBadge() {
  const { t } = useTranslation('admin');
  return (
    <Badge tone="neutral">
      <Ban aria-hidden />
      {t('sales.doNotContact')}
    </Badge>
  );
}

const POST_STATUS: Record<SalesPostStatusValue, { tone: Tone; icon: LucideIcon }> = {
  draft: { tone: 'warning', icon: FileEdit },
  approved: { tone: 'info', icon: CheckCircle2 },
  scheduled: { tone: 'primary', icon: Clock },
  published: { tone: 'success', icon: Globe },
};

/** Instagram gönderisi durumu: renk + ikon + metin */
export function PostStatusBadge({ status }: { status: SalesPostStatusValue }) {
  const { t } = useTranslation('admin');
  const s = POST_STATUS[status];
  return (
    <Badge tone={s.tone}>
      <s.icon aria-hidden />
      {t(`sales.posts.status.${status}`)}
    </Badge>
  );
}

/** Satış bölümünün iki sekmesi; her biri ayrı adres (geri tuşu ve yer imi çalışır) */
export function SalesTabs() {
  const { t } = useTranslation('admin');
  const item = (to: string, label: string) => (
    <NavLink
      to={to}
      end={to === '/admin/sales'}
      className={({ isActive }) =>
        cn(
          '-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-150',
          isActive ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink',
        )
      }
    >
      {label}
    </NavLink>
  );
  return (
    <nav aria-label={t('sales.tabs.label')} className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
      {item('/admin/sales', t('sales.tabs.leads'))}
      {item('/admin/sales/posts', t('sales.tabs.posts'))}
    </nav>
  );
}

/** Taslaktaki `[Adın]` yer tutucusu, kopyalayan adminin adıyla değiştirilir */
export function useFillName() {
  const { user } = useAuth();
  return (text: string) => (user?.name ? text.replaceAll('[Adın]', user.name) : text);
}

/** Panoya kopyalar ve "Kopyalandı" bildirir; başarılıysa true */
export function useCopy() {
  const { t } = useTranslation('admin');
  return async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('sales.lead.copied'));
      return true;
    } catch {
      toast.error(t('sales.lead.copyFailed'));
      return false;
    }
  };
}

/** E-posta taslağı: ilk satır "Konu: ..." ise konu satırı olur, kalanı gövde */
export function mailtoHref(email: string, message: string | null): string {
  if (!message) return `mailto:${email}`;
  const match = /^\s*Konu:\s*(.+)\r?\n/.exec(message);
  const subject = match ? match[1]!.trim() : '';
  const body = (match ? message.slice(match[0].length) : message).trim();
  const params = [subject ? `subject=${encodeURIComponent(subject)}` : '', `body=${encodeURIComponent(body)}`].filter(Boolean).join('&');
  return `mailto:${email}?${params}`;
}

/** Instagram alanı kullanıcı adı ya da adres olabilir */
export function instagramHref(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.instagram.com/${value.replace(/^@/, '').replace(/^instagram\.com\//i, '')}`;
}

/** Yetkili istekle dosya indirir (CSV); 401'de oturum bir kez yenilenir */
export async function downloadAuthed(path: string, fileName: string): Promise<void> {
  const go = () => fetch(`/api/v1${path}`, { headers: { authorization: `Bearer ${authStore.get().accessToken ?? ''}` } });
  let res = await go();
  if (res.status === 401 && (await refreshSession())) res = await go();
  if (!res.ok) throw new Error(String(res.status));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Meta Business Suite gönderi ekranı (paylaşım elle yapılır) */
export const META_BUSINESS_URL = 'https://business.facebook.com/latest/posts/';

/** Bugün (İstanbul), YYYY-MM-DD */
export function istanbulToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

/** YYYY-MM-DD gününe n gün ekler (saat dilimsiz) */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}
