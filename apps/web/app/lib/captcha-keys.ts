import { useRouteLoaderData } from 'react-router';
import type { loader } from '../routes/public/layout';

/**
 * Bot koruması site anahtarları (Turnstile, reCAPTCHA v3). Gizli değildir; web sunucusunda çalışma anında
 * `TURNSTILE_SITE_KEY` / `RECAPTCHA_SITE_KEY`'den okunur ve halka açık yerleşim loader'ıyla gelir
 * (koda gömülmez: değiştirmek için yeniden derleme gerekmez). Boşsa doğrulama yüklenmez.
 */
export interface CaptchaKeys {
  turnstile: string;
  recaptcha: string;
}

/** Sunucuda (loader): ortam değişkenlerinden */
export function readCaptchaKeys(source: Record<string, string | undefined> = process.env): CaptchaKeys {
  return { turnstile: source.TURNSTILE_SITE_KEY?.trim() ?? '', recaptcha: source.RECAPTCHA_SITE_KEY?.trim() ?? '' };
}

/** İstemcide: halka açık yerleşimin loader verisinden (formlar sadece halka açık sayfalarda) */
export function useCaptchaKeys(): CaptchaKeys {
  const data = useRouteLoaderData<typeof loader>('routes/public/layout');
  return data?.captcha ?? { turnstile: '', recaptcha: '' };
}
