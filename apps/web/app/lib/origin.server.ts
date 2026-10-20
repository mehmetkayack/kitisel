/**
 * Sitenin herkese açık kökü (canonical, hreflang, og:url, JSON-LD). Production'da web sunucusu ters vekilin
 * (Caddy) arkasında `http://` istek görür; bu yüzden `WEB_URL` (ör. https://kitisel.com) esas alınır.
 * Tanımlı değilse (geliştirme) isteğin kendi kökü.
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.WEB_URL?.trim().replace(/\/+$/, '');
  return configured || new URL(request.url).origin;
}
