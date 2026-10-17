import type { Config } from '@react-router/dev/config';

export default {
  // Halka açık sayfalar SEO için sunucuda render edilir. Panel (/app) ve admin (/admin)
  // sunucu loader'ı olmayan, clientLoader + HydrateFallback kullanan rotalardır (sadece istemci).
  ssr: true,
} satisfies Config;
