interface Window {
  /** Cloudflare Turnstile (sadece site anahtarı tanımlıysa yüklenir) */
  turnstile?: {
    render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void; language?: string }): string;
    reset(id?: string): void;
  };
  /** Google reCAPTCHA v3 (sadece site anahtarı tanımlıysa, iletişim sayfasında yüklenir) */
  grecaptcha?: {
    ready(cb: () => void): void;
    execute(siteKey: string, opts: { action: string }): Promise<string>;
  };
}
