/**
 * E-posta istemcileri CSS değişkenlerini desteklemediği için tasarım token'larının
 * değerleri burada tekrar edilir. Kaynak: packages/ui/src/tokens.css (açık tema).
 * Ham renk kodu kuralının (Bölüm 6.2) tek bilinçli istisnası budur.
 */
export const emailTheme = {
  // Kitisel (tokens.css Kitisel kapsamı, açık tema): Ember eylem, Kâğıt zemin, sıcak kenarlık
  primary: '#C2410C',
  primaryText: '#FFFFFF',
  ink: '#0F172A',
  inkMuted: '#475569',
  border: '#F1E4D6',
  surface: '#FFFFFF',
  background: '#FFFBF5',
  fontFamily:
    "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
} as const;
