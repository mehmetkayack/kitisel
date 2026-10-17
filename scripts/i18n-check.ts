/**
 * i18n anahtar kontrolü (Bölüm 2, CI'da çalışır).
 * Referans dil İngilizcedir. Her dil ve namespace için:
 *  - eksik anahtar  -> hata
 *  - fazla anahtar  -> hata
 *  - boş çeviri     -> hata
 *  - {{değişken}} farkı -> hata (çeviride eksik/fazla değişken metni bozar)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '../packages/config/src/locales.ts';
import { repoRoot } from './workspace-aliases.ts';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [ck, cv] of flatten(v, key)) out.set(ck, cv);
  }
  return out;
}

function vars(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] ?? '').sort();
}

const dir = join(repoRoot, 'locales');
const load = (locale: string, ns: string) =>
  flatten(JSON.parse(readFileSync(join(dir, locale, `${ns}.json`), 'utf8')) as Tree);

const namespaces = readdirSync(join(dir, 'en'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const errors: string[] = [];
for (const ns of namespaces) {
  const ref = load('en', ns);
  for (const locale of LOCALES) {
    let current: Map<string, string>;
    try {
      current = load(locale, ns);
    } catch (err) {
      errors.push(`${locale}/${ns}.json okunamadı: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const [key, text] of ref) {
      const translated = current.get(key);
      if (translated === undefined) errors.push(`${locale}/${ns}: eksik anahtar "${key}"`);
      else if (!translated.trim()) errors.push(`${locale}/${ns}: boş çeviri "${key}"`);
      else if (vars(text).join() !== vars(translated).join()) {
        errors.push(`${locale}/${ns}: "${key}" değişkenleri farklı (${vars(text).join(', ')} ≠ ${vars(translated).join(', ')})`);
      }
    }
    for (const key of current.keys()) {
      if (!ref.has(key)) errors.push(`${locale}/${ns}: fazla anahtar "${key}" (en'de yok)`);
    }
  }
}

if (errors.length) {
  console.error(`✗ i18n kontrolü başarısız (${errors.length} sorun):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ i18n: ${LOCALES.length} dil × ${namespaces.length} namespace eksiksiz`);
