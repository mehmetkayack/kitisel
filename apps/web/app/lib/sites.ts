import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ConnectionDto, ContentDetailDto, ContentUsageDto, PostsDto, RefreshDto, SiteAuditDto, SiteDto, TopicDto, UpdateBrandInput, UpdateSiteInput } from '@upvine/shared';
import { toast } from '@upvine/ui';
import { api, ApiError } from './api';

export const sitesKey = ['sites'] as const;
export const topicsKey = (siteId: string) => ['sites', siteId, 'topics'] as const;
export const auditKey = (siteId: string) => ['sites', siteId, 'audit'] as const;
export const contentKey = ['content'] as const;
export const postsKey = (siteId: string) => ['sites', siteId, 'posts'] as const;

/** Arka planda süren bir iş var mı (analiz, konu önerisi, yazı eşitleme): varsa liste kısa aralıkla yenilenir. */
export function isSiteBusy(site: SiteDto): boolean {
  return site.analysisStatus === 'pending' || site.analysisStatus === 'running' || site.topicsStatus === 'running' || site.postsSyncStatus === 'running';
}

export function useSites() {
  return useQuery({
    queryKey: sitesKey,
    queryFn: () => api<{ items: SiteDto[] }>('/sites').then((r) => r.items),
    refetchInterval: (query) => (query.state.data?.some(isSiteBusy) ? 2_000 : false),
  });
}

/** Şimdilik organizasyon başına tek site (Agency çoklu site Faz 6). */
export function useCurrentSite() {
  const sites = useSites();
  return { ...sites, site: sites.data?.[0] ?? null };
}

export function useTopics(siteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: topicsKey(siteId ?? ''),
    queryFn: () => api<{ items: TopicDto[] }>(`/sites/${siteId}/topics`).then((r) => r.items),
    enabled: !!siteId && enabled,
  });
}

export function useAudit(siteId: string | undefined) {
  return useQuery({
    queryKey: auditKey(siteId ?? ''),
    queryFn: () => api<{ audit: SiteAuditDto | null }>(`/sites/${siteId}/audit`).then((r) => r.audit),
    enabled: !!siteId,
  });
}

/** Mevcut yazılar; eşitleme bitince (`syncedAt` değişir) yeniden çekilir. Öneri hazırlanırken kısa aralıkla. */
export function usePosts(siteId: string | undefined, syncedAt: string | null) {
  return useQuery({
    queryKey: [...postsKey(siteId ?? ''), syncedAt],
    queryFn: () => api<PostsDto>(`/sites/${siteId}/posts`),
    enabled: !!siteId,
    refetchInterval: (q) => (q.state.data?.posts.some((p) => p.refresh?.status === 'generating') ? 3_000 : false),
  });
}

export const refreshKey = (siteId: string, refreshId: string) => ['sites', siteId, 'refresh', refreshId] as const;

/** Güncelleme önerisinin tamamı (önce/sonra); hazırlanırken 2 sn'de bir sorgulanır. */
export function useRefresh(siteId: string, refreshId: string | null) {
  return useQuery({
    queryKey: refreshKey(siteId, refreshId ?? ''),
    queryFn: () => api<RefreshDto>(`/sites/${siteId}/refreshes/${refreshId}`),
    enabled: !!refreshId,
    refetchInterval: (q) => (q.state.data?.status === 'generating' ? 2_000 : false),
  });
}

export function useRefreshMutations(siteId: string) {
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const done = (r: RefreshDto) => {
    qc.setQueryData(refreshKey(siteId, r.id), r);
    void qc.invalidateQueries({ queryKey: postsKey(siteId) });
  };
  const request = useMutation({
    mutationFn: (postId: string) => api<RefreshDto>(`/sites/${siteId}/posts/${postId}/refresh`, { method: 'POST' }),
    onSuccess: done,
    onError,
  });
  const call = (name: 'apply' | 'revert' | 'dismiss') => (refreshId: string) => api<RefreshDto>(`/sites/${siteId}/refreshes/${refreshId}/${name}`, { method: 'POST' });
  const apply = useMutation({ mutationFn: call('apply'), onSuccess: done, onError });
  const revert = useMutation({ mutationFn: call('revert'), onSuccess: done, onError });
  const dismiss = useMutation({ mutationFn: call('dismiss'), onSuccess: done, onError });
  return { request, apply, revert, dismiss };
}

/** İçerik listesi; üretimde olan yazı varsa kısa aralıkla yenilenir. Aylık hak bilgisiyle. */
export function useContentList() {
  return useQuery({
    queryKey: contentKey,
    queryFn: () => api<{ items: TopicDto[]; usage: ContentUsageDto }>('/content'),
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.status === 'generating') ? 3_000 : false),
  });
}

export function useContent() {
  const list = useContentList();
  return { ...list, data: list.data?.items };
}

export const contentDetailKey = (id: string) => ['content', id] as const;

export function useContentDetail(id: string) {
  return useQuery({
    queryKey: contentDetailKey(id),
    queryFn: () => api<ContentDetailDto>(`/content/${id}`),
    // Yazılırken ve yayınlanırken ilerleme canlı görünsün (Bölüm 4.4: polling)
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (d.status === 'generating') return 3_000;
      if (d.status === 'scheduled' && d.siteConnected && d.plannedAt && Date.parse(d.plannedAt) <= Date.now() + 60_000) return 4_000;
      return false;
    },
  });
}

export const connectionKey = (siteId: string) => ['sites', siteId, 'connection'] as const;

export function useConnection(siteId: string | undefined) {
  return useQuery({
    queryKey: connectionKey(siteId ?? ''),
    queryFn: () => api<{ connection: ConnectionDto | null; oneClickAvailable: boolean }>(`/sites/${siteId}/connection`),
    enabled: !!siteId,
  });
}

export function useApiErrorToast() {
  const { t } = useTranslation('common');
  return (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('errorPage.body'));
}

/** Site güncellemesi: yanıt önbelleğe yazılır, böylece sihirbaz anında sonraki adıma geçer. */
export function useSiteMutations(siteId: string) {
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const store = (site: SiteDto) => {
    qc.setQueryData<SiteDto[]>(sitesKey, (old) => (old ? old.map((s) => (s.id === site.id ? site : s)) : [site]));
  };

  const update = useMutation({
    mutationFn: (patch: UpdateSiteInput) => api<SiteDto>(`/sites/${siteId}`, { method: 'PATCH', body: patch }),
    onSuccess: (site) => {
      store(site);
      void qc.invalidateQueries({ queryKey: topicsKey(siteId) });
    },
    onError,
  });
  const updateBrand = useMutation({
    mutationFn: (input: UpdateBrandInput) => api<SiteDto>(`/sites/${siteId}/brand`, { method: 'PUT', body: input }),
    onSuccess: store,
    onError,
  });
  const reanalyze = useMutation({
    mutationFn: () => api<SiteDto>(`/sites/${siteId}/analyze`, { method: 'POST' }),
    onSuccess: (site) => {
      store(site);
      void qc.invalidateQueries({ queryKey: auditKey(siteId) });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api(`/sites/${siteId}`, { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData<SiteDto[]>(sitesKey, (old) => old?.filter((s) => s.id !== siteId) ?? []),
    onError,
  });
  const generateTopics = useMutation({
    mutationFn: () => api<SiteDto>(`/sites/${siteId}/topics/generate`, { method: 'POST' }),
    onSuccess: store,
    onError,
  });
  const complete = useMutation({
    mutationFn: () => api<SiteDto>(`/sites/${siteId}/onboarding/complete`, { method: 'POST' }),
    onSuccess: (site) => {
      store(site);
      void qc.invalidateQueries({ queryKey: contentKey });
      void qc.invalidateQueries({ queryKey: topicsKey(siteId) });
    },
    onError,
  });
  const syncPosts = useMutation({
    mutationFn: () => api<SiteDto>(`/sites/${siteId}/posts/sync`, { method: 'POST' }),
    onSuccess: store,
    onError,
  });
  return { update, updateBrand, reanalyze, remove, generateTopics, complete, syncPosts, store };
}

/** Tarih ve sayı biçimlendirme kullanıcının arayüz dilinde. */
export function useFormatters() {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return {
    date: (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso)),
    dateTime: (iso: string, timeZone?: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso)),
    weekdayDate: (iso: string, timeZone?: string) =>
      new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso)),
    number: (n: number) => new Intl.NumberFormat(locale).format(n),
    /** 0,42 → "%42" (tr) / "42%" (en) */
    percent: (ratio: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio),
    /** `YYYY-MM-DD` (gün; saat dilimi yok) → "12 Eki" */
    shortDate: (day: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)),
    /** `YYYY-MM-DD` → uzun tarih */
    day: (day: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)),
    /** 0 = Pazar */
    weekday: (day: number, style: 'long' | 'short' = 'long') =>
      new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day))),
    country: (code: string) => {
      try {
        return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
      } catch {
        return code;
      }
    },
  };
}
