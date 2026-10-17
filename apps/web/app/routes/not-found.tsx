import { data } from 'react-router';

/** Eşleşmeyen tüm adresler: kök ErrorBoundary çevrilmiş 404 sayfasını gösterir. */
export function loader() {
  throw data(null, { status: 404 });
}

export default function NotFound() {
  return null;
}
