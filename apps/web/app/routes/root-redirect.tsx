import { redirect } from 'react-router';
import type { Route } from './+types/root-redirect';
import { preferencesFromRequest } from '../lib/preferences';

/** "/" -> kayıtlı dil ya da tarayıcı dili ("/de", "/tr" ...) */
export function loader({ request }: Route.LoaderArgs) {
  const { locale } = preferencesFromRequest(request);
  return redirect(`/${locale}`, { headers: { vary: 'Accept-Language, Cookie' } });
}

export default function RootRedirect() {
  return null;
}
