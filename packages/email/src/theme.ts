/**
 * E-posta istemcileri CSS değişkenlerini desteklemediği için tasarım token'larının
 * değerleri burada tekrar edilir. Kaynak: packages/ui/src/tokens.css (açık tema).
 * Ham renk kodu kuralının (Bölüm 6.2) tek bilinçli istisnası budur.
 */
export const emailTheme = {
  primary: '#3B5BDB',
  primaryText: '#FFFFFF',
  ink: '#0F172A',
  inkMuted: '#475569',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
} as const;
