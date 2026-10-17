export interface RobotsRules {
  found: boolean;
  /** `*` grubu siteyi tamamen kapatıyor mu (`Disallow: /`) */
  disallowAll: boolean;
  sitemaps: string[];
  isAllowed(path: string): boolean;
}

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
}

function toRegex(rule: string): RegExp {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * Basit robots.txt yorumlayıcı (RFC 9309): bizim User-Agent'ımıza veya `*` grubuna uyar,
 * en uzun eşleşen kural kazanır, eşitlikte Allow kazanır.
 */
export function parseRobots(text: string | null, userAgent: string): RobotsRules {
  if (text === null) return { found: false, disallowAll: false, sitemaps: [], isAllowed: () => true };
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' && value) current.allow.push(value);
    if (key === 'disallow' && value) current.disallow.push(value);
  }

  const token = userAgent.split('/')[0]!.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const allow = applicable.flatMap((g) => g.allow).map((r) => ({ len: r.length, re: toRegex(r) }));
  const disallow = applicable.flatMap((g) => g.disallow).map((r) => ({ len: r.length, re: toRegex(r) }));
  const star = groups.filter((g) => g.agents.includes('*'));

  return {
    found: true,
    disallowAll: star.some((g) => g.disallow.includes('/') && !g.allow.includes('/')),
    sitemaps,
    isAllowed(path) {
      const a = Math.max(-1, ...allow.filter((r) => r.re.test(path)).map((r) => r.len));
      const d = Math.max(-1, ...disallow.filter((r) => r.re.test(path)).map((r) => r.len));
      return d < 0 || a >= d;
    },
  };
}
