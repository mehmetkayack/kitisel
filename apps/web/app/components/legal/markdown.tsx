import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * Yasal metinler için sınırlı Markdown: `#`/`##`/`###` başlık, `- ` ve `1. ` liste, paragraf (satır sonları korunur), `**kalın**`,
 * `[metin](adres)`. HTML üretilmez (React öğeleri): metin dosyası avukatça düzenlenebilir, enjeksiyon yok.
 * `/` ile başlayan adreslere dil öneki eklenir.
 */
export interface LegalBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol';
  lines: string[];
}

export function parseLegalMarkdown(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const chunk of source.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0]!;
    const heading = /^(#{1,3})\s+(.*)$/.exec(first);
    if (heading) {
      blocks.push({ type: (['h1', 'h2', 'h3'] as const)[heading[1]!.length - 1]!, lines: [heading[2]!] });
      if (lines.length > 1) blocks.push(...parseLegalMarkdown(lines.slice(1).join('\n')));
      continue;
    }
    if (lines.every((l) => /^- /.test(l))) blocks.push({ type: 'ul', lines: lines.map((l) => l.slice(2)) });
    else if (lines.every((l) => /^\d+\.\s/.test(l))) blocks.push({ type: 'ol', lines: lines.map((l) => l.replace(/^\d+\.\s+/, '')) });
    else blocks.push({ type: 'p', lines });
  }
  return blocks;
}

/** `{{anahtar}}` yer tutucuları; değer yoksa köşeli parantezli etiket kalır (doldurulması gerektiği görünsün). */
export function fillPlaceholders(source: string, values: Record<string, string | null>, missing: (key: string) => string): string {
  return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `[${missing(key)}]`);
}

function inline(text: string, locale: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={m.index}>{m[1]}</strong>);
    else {
      const href = m[3]!;
      out.push(
        href.startsWith('/') ? (
          <Link key={m.index} to={`/${locale}${href}`} className="font-medium text-primary underline-offset-2 hover:underline">
            {m[2]}
          </Link>
        ) : (
          <a key={m.index} href={href} className="font-medium break-words text-primary underline-offset-2 hover:underline" rel="noopener noreferrer">
            {m[2]}
          </a>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function LegalMarkdown({ blocks, locale }: { blocks: LegalBlock[]; locale: string }) {
  return (
    <div className="flex flex-col gap-4 text-ink">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h1':
            return (
              <h1 key={i} className="text-3xl font-bold break-words sm:text-4xl">
                {inline(b.lines[0]!, locale)}
              </h1>
            );
          case 'h2':
            return (
              <h2 key={i} className="mt-6 text-xl font-semibold break-words">
                {inline(b.lines[0]!, locale)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={i} className="mt-2 font-semibold break-words">
                {inline(b.lines[0]!, locale)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={i} className="measure flex list-disc flex-col gap-2 pl-6">
                {b.lines.map((l, j) => (
                  <li key={j}>{inline(l, locale)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="measure flex list-decimal flex-col gap-2 pl-6">
                {b.lines.map((l, j) => (
                  <li key={j}>{inline(l, locale)}</li>
                ))}
              </ol>
            );
          default:
            // Paragraf içindeki satır sonları korunur (adres ve taraf bilgileri satır satır)
            return (
              <p key={i} className="measure break-words">
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 ? <br /> : null}
                    {inline(l, locale)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
