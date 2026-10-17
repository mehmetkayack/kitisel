/** Kitisel favicon'ları (halka açık site ve müşteri paneli yerleşimlerinin `links` çıktısı). */
export function brandLinks() {
  return [
    { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    { rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
    { rel: 'apple-touch-icon', href: '/favicon-180.png' },
  ];
}
