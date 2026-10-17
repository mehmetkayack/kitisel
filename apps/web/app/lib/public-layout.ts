import { useRouteLoaderData } from 'react-router';
import type { loader } from '../routes/public/layout';

/** Halka açık sayfalarda yerleşim loader'ının verisi: site kökü ve satıcı bilgileri (yasal sayfalar, İletişim). */
export function usePublicLayoutData() {
  const data = useRouteLoaderData<typeof loader>('routes/public/layout');
  if (!data) throw new Error('usePublicLayoutData: halka açık yerleşim dışında çağrıldı');
  return data;
}
