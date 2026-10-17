import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import sharp from 'sharp';

/**
 * Makale bilgi grafiği (Bölüm 7.6): başlık + 3-6 ana çıkarım, marka renklerinde, 1080×1350 (4:5,
 * sosyal medyaya uygun). satori metni yol (path) olarak gömer, sharp WebP'ye çevirir. Yapay zekâ
 * çağrısı yok: çıkarımlar yazım çağrısının çıktısından gelir.
 */

const WIDTH = 1080;
const HEIGHT = 1350;

/** Inter'in kapsadığı yazı sistemleri. Arapça, İbranice, Devanagari, CJK ve Tay için font yok: bilgi grafiği üretilmez. */
const UNSUPPORTED = new Set(['ar', 'he', 'hi', 'ja', 'ko', 'zh-CN', 'th']);

export function infographicSupported(language: string): boolean {
  return !UNSUPPORTED.has(language);
}

const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'greek', 'vietnamese'] as const;
type FontEntry = { name: string; data: Buffer; weight: 400 | 700; style: 'normal' };
let fontsPromise: Promise<FontEntry[]> | null = null;

/** @fontsource/inter WOFF dosyaları (satori WOFF2 desteklemiyor); süreç başına bir kez okunur. */
function loadFonts(): Promise<FontEntry[]> {
  fontsPromise ??= (async () => {
    const require = createRequire(import.meta.url);
    const entries: FontEntry[] = [];
    for (const subset of SUBSETS) {
      for (const weight of [400, 700] as const) {
        const file = require.resolve(`@fontsource/inter/files/inter-${subset}-${weight}-normal.woff`);
        entries.push({ name: `Inter-${subset}`, data: await readFile(file), weight, style: 'normal' });
      }
    }
    return entries;
  })();
  return fontsPromise;
}

const FONT_FAMILY = SUBSETS.map((s) => `Inter-${s}`).join(', ');

/** Tasarım token'larının değerleri (packages/ui/src/tokens.css): marka rengi yoksa kobalt + yeşil. */
const DEFAULT_PRIMARY = '#3B5BDB';
const DEFAULT_ACCENT = '#0E9F6E';
const INK = '#0F172A';
const INK_MUTED = '#475569';
const SURFACE = '#FFFFFF';
const SURFACE_MUTED = '#F1F5F9';

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c.trim());

/** Marka renklerinden okunaklı bir çift: başlık bandı (üstünde beyaz metin AA) ve vurgu. */
export function pickColors(brandColors: string[] | null | undefined): { primary: string; accent: string } {
  const valid = (brandColors ?? []).map((c) => c.trim()).filter(isHex);
  const primary = valid.find((c) => contrast(c, SURFACE) >= 4.5) ?? DEFAULT_PRIMARY;
  // Tek marka rengi varsa vurgu da odur (iki farklı markanın rengi yan yana görünmesin).
  const accent = valid.find((c) => c !== primary && contrast(c, SURFACE) >= 3) ?? (valid.length ? primary : DEFAULT_ACCENT);
  return { primary, accent };
}

type Node = { type: string; props: { style?: Record<string, unknown>; children?: Node | Node[] | string } };
const el = (type: string, style: Record<string, unknown>, children?: Node | Node[] | string): Node => ({ type, props: { style, children } });

export interface InfographicInput {
  title: string;
  points: string[];
  brandName: string;
  domain: string;
  brandColors: string[] | null;
}

export async function renderInfographicSvg(input: InfographicInput): Promise<string> {
  const { primary, accent } = pickColors(input.brandColors);
  const points = input.points.slice(0, 6);
  const pointSize = points.length > 4 ? 34 : 38;
  const tree = el(
    'div',
    { width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column', backgroundColor: SURFACE, fontFamily: FONT_FAMILY },
    [
      el('div', { display: 'flex', flexDirection: 'column', gap: 20, padding: '72px 72px 56px', backgroundColor: primary }, [
        el('div', { display: 'flex', fontSize: 28, fontWeight: 700, color: SURFACE, opacity: 0.85, letterSpacing: 1 }, input.brandName.slice(0, 60)),
        el('div', { display: 'block', fontSize: 58, fontWeight: 700, color: SURFACE, lineHeight: 1.15, lineClamp: 4 }, input.title.slice(0, 160)),
      ]),
      el(
        'div',
        { display: 'flex', flexDirection: 'column', gap: 26, padding: '56px 72px', flexGrow: 1 },
        points.map((p, i) =>
          el('div', { display: 'flex', alignItems: 'flex-start', gap: 28, padding: '22px 28px', backgroundColor: SURFACE_MUTED, borderRadius: 20 }, [
            el(
              'div',
              { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, flexShrink: 0, borderRadius: 32, backgroundColor: accent, color: SURFACE, fontSize: 32, fontWeight: 700 },
              String(i + 1),
            ),
            el('div', { display: 'block', fontSize: pointSize, fontWeight: 400, color: INK, lineHeight: 1.3, lineClamp: 3, paddingTop: 6 }, p.slice(0, 140)),
          ]),
        ),
      ),
      el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 72px 48px', borderTop: `2px solid ${SURFACE_MUTED}` }, [
        el('div', { display: 'flex', fontSize: 26, color: INK_MUTED }, input.domain),
        el('div', { display: 'flex', width: 120, height: 10, borderRadius: 5, backgroundColor: accent }),
      ]),
    ],
  );
  // satori React öğesi bekler; düz nesne ağacı aynı biçimdedir.
  return satori(tree as unknown as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts: await loadFonts() });
}

export interface InfographicImage {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
}

export async function createInfographic(input: InfographicInput): Promise<InfographicImage> {
  const svg = await renderInfographicSvg(input);
  const data = await sharp(Buffer.from(svg)).webp({ quality: 88 }).toBuffer();
  return { data, mimeType: 'image/webp', width: WIDTH, height: HEIGHT };
}
