import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KeywordsDto, OverviewDto, SearchConsoleDto, VisibilityDto } from '@upvine/shared';
import { api } from './api';
import { useApiErrorToast } from './sites';

const gscKey = (siteId: string) => ['sites', siteId, 'search-console'] as const;
const overviewKey = (siteId: string) => ['sites', siteId, 'results', 'overview'] as const;
const keywordsKey = (siteId: string) => ['sites', siteId, 'results', 'keywords'] as const;
const visibilityKey = (siteId: string) => ['sites', siteId, 'visibility'] as const;

/** Search Console bağlantısı; eşitleme sürerken 3 sn'de bir yenilenir, bitince sonuçlar tazelenir. */
export function useSearchConsole(siteId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: gscKey(siteId ?? ''),
    queryFn: async () => {
      const prev = qc.getQueryData<SearchConsoleDto>(gscKey(siteId!));
      const next = await api<SearchConsoleDto>(`/sites/${siteId}/search-console`);
      if (prev?.connection?.syncStatus === 'running' && next.connection?.syncStatus !== 'running') {
        void qc.invalidateQueries({ queryKey: ['sites', siteId, 'results'] });
      }
      return next;
    },
    enabled: !!siteId,
    refetchInterval: (q) => (q.state.data?.connection?.syncStatus === 'running' ? 3_000 : false),
  });
}

export function useSearchConsoleMutations(siteId: string) {
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const store = (d: SearchConsoleDto) => qc.setQueryData(gscKey(siteId), d);
  const connect = useMutation({
    mutationFn: () => api<{ url: string }>(`/sites/${siteId}/search-console/authorize-url`),
    // Google izin ekranına tam sayfa yönlendirme; dönüş /app/settings?gsc=...
    onSuccess: ({ url }) => window.location.assign(url),
    onError,
  });
  const selectProperty = useMutation({
    mutationFn: (property: string) => api<SearchConsoleDto>(`/sites/${siteId}/search-console/property`, { method: 'PUT', body: { property } }),
    onSuccess: store,
    onError,
  });
  const sync = useMutation({ mutationFn: () => api<SearchConsoleDto>(`/sites/${siteId}/search-console/sync`, { method: 'POST' }), onSuccess: store, onError });
  const disconnect = useMutation({
    mutationFn: () => api(`/sites/${siteId}/search-console`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gscKey(siteId) });
      void qc.invalidateQueries({ queryKey: ['sites', siteId, 'results'] });
    },
    onError,
  });
  return { connect, selectProperty, sync, disconnect };
}

export function useOverview(siteId: string | undefined) {
  return useQuery({ queryKey: overviewKey(siteId ?? ''), queryFn: () => api<OverviewDto>(`/sites/${siteId}/results/overview`), enabled: !!siteId });
}

export function useKeywords(siteId: string | undefined) {
  return useQuery({ queryKey: keywordsKey(siteId ?? ''), queryFn: () => api<KeywordsDto>(`/sites/${siteId}/results/keywords`), enabled: !!siteId });
}

/** AI görünürlük; tur sürerken 3 sn'de bir yenilenir. */
export function useVisibility(siteId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: visibilityKey(siteId ?? ''),
    queryFn: async () => {
      const prev = qc.getQueryData<VisibilityDto>(visibilityKey(siteId!));
      const next = await api<VisibilityDto>(`/sites/${siteId}/visibility`);
      if (prev?.status === 'running' && next.status !== 'running') void qc.invalidateQueries({ queryKey: overviewKey(siteId!) });
      return next;
    },
    enabled: !!siteId,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 3_000 : false),
  });
}

export function useVisibilityMutations(siteId: string) {
  const qc = useQueryClient();
  const onError = useApiErrorToast();
  const store = (d: VisibilityDto) => {
    qc.setQueryData(visibilityKey(siteId), d);
    void qc.invalidateQueries({ queryKey: overviewKey(siteId) });
  };
  const run = useMutation({ mutationFn: () => api<VisibilityDto>(`/sites/${siteId}/visibility/run`, { method: 'POST' }), onSuccess: store, onError });
  const add = useMutation({
    mutationFn: (question: string) => api<VisibilityDto>(`/sites/${siteId}/visibility/questions`, { method: 'POST', body: { question } }),
    onSuccess: store,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<VisibilityDto>(`/sites/${siteId}/visibility/questions/${id}`, { method: 'DELETE' }),
    onSuccess: store,
    onError,
  });
  return { run, add, remove };
}
