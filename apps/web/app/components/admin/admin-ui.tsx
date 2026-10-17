import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, CircleHelp, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminStats, Page } from '@upvine/shared';
import { Badge, Button, Field, Input } from '@upvine/ui';
import { api } from '../../lib/api';

/** Kullanıcının dilinde tarih/saat (ör. "9 Eki 2026 16:40") */
export function useFormatDate() {
  const { i18n } = useTranslation();
  return (iso: string | null, withTime = false): string | null => {
    if (!iso) return null;
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' } : {}),
    }).format(new Date(iso));
  };
}

export function useFormatNumber() {
  const { i18n } = useTranslation();
  return (n: number) => new Intl.NumberFormat(i18n.language).format(n);
}

type HealthValue = AdminStats['health'][keyof AdminStats['health']];

/** Sistem durumu: renk + ikon + metin (durum asla sadece renkle verilmez) */
export function HealthBadge({ value }: { value: HealthValue }) {
  const { t } = useTranslation('admin');
  if (value === 'ok') {
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden />
        {t('health.ok')}
      </Badge>
    );
  }
  if (value === 'down' || value === 'stale') {
    return (
      <Badge tone="danger">
        <AlertCircle aria-hidden />
        {t(`health.${value}`)}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <CircleHelp aria-hidden />
      {t(`health.${value}`)}
    </Badge>
  );
}

/** Yazdıkça arama: 300 ms gecikmeyle (her tuşta istek atılmaz) */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Cursor tabanlı admin listesi (Bölüm 3.4): "Daha fazla göster" ile sonraki sayfa */
export function useAdminList<T>(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  return useInfiniteQuery({
    queryKey: ['admin', path, query],
    queryFn: ({ pageParam }) =>
      api<Page<T>>(`/admin/${path}?${query}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} className="w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input type="search" className="pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

export function LoadMore({ show, loading, onClick }: { show: boolean; loading: boolean; onClick: () => void }) {
  const { t } = useTranslation('admin');
  if (!show) return null;
  return (
    <div className="flex justify-center">
      <Button variant="secondary" loading={loading} onClick={onClick}>
        {t('list.loadMore')}
      </Button>
    </div>
  );
}

/** Tanım listesi satırı (ayrıntı kartlarında) */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-ink-muted sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}
