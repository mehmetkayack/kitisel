import { randomBytes } from 'node:crypto';

/** "Müller & Söhne GmbH" -> "muller-sohne-gmbh-3fa9c1". Rastgele ek çakışmayı önler. */
export function orgSlug(name: string): string {
  const base = name
    .toLocaleLowerCase('en')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  const suffix = randomBytes(3).toString('hex');
  return base ? `${base}-${suffix}` : `org-${suffix}`;
}
