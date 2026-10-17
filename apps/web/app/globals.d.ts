/** vite.config.ts `define` ile gelen herkese açık değerler. */
declare const __TURNSTILE_SITE_KEY__: string;

interface Window {
  /** Cloudflare Turnstile (sadece site anahtarı tanımlıysa yüklenir) */
  turnstile?: {
    render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void; language?: string }): string;
    reset(id?: string): void;
  };
}
