/** Kullanıcının yazdığı site adresini normalize eder: `example.com` → `https://example.com/`. */
export function normalizeSiteUrl(input: string): { url: string; domain: string } | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  // Alan adı en az bir nokta içermeli (localhost, intranet adları değil). IP adresleri SSRF katmanında elenir.
  if (!host.includes('.') || host.endsWith('.')) return null;
  return { url: `${parsed.protocol}//${parsed.host.toLowerCase()}/`, domain: host.replace(/^www\./, '') };
}

/** Aynı site mi? (`www.` farkı yok sayılır) */
export function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.toLowerCase().replace(/^www\./, '');
    const hb = new URL(b).hostname.toLowerCase().replace(/^www\./, '');
    return ha === hb;
  } catch {
    return false;
  }
}

/** Karşılaştırma için URL: fragment ve sondaki `/` atılır. */
export function canonicalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  let s = u.toString();
  if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
  return s;
}

const NON_HTML_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|avif|ico|css|js|mjs|json|xml|txt|zip|rar|gz|mp4|webm|mp3|wav|docx?|xlsx?|pptx?|woff2?|ttf|eot)$/i;

export function looksLikeHtmlPage(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !NON_HTML_EXT.test(u.pathname);
  } catch {
    return false;
  }
}
