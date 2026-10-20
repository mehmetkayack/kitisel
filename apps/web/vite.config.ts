import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { repoRoot, workspaceAliases } from '../../scripts/workspace-aliases.ts';

export default defineConfig(({ mode }) => {
  // Kök .env dosyasından sadece API adresi okunur; gizli bilgiler tarayıcı paketine girmez.
  const env = loadEnv(mode, repoRoot, '');
  const apiUrl = env.API_URL || 'http://localhost:4000';
  // E2E testleri ayrı port ve önbellekle ikinci bir sunucu açar (bkz. e2e/env.ts)
  const port = Number(env.WEB_PORT || 5173);
  // Yasal sayfaların satıcı bilgileri sunucuda (SSR) process.env'den okunur; geliştirmede kök .env'den.
  // Production'da web sunucusu ortam değişkenlerini doğrudan alır (tarayıcı paketine girmez).
  for (const [k, v] of Object.entries(env)) if (k.startsWith('LEGAL_') && process.env[k] === undefined) process.env[k] = v;
  // Blog sayfaları SSR'da yazıları API'den okur (sunucudan sunucuya)
  process.env.API_URL ??= apiUrl;

  return {
    plugins: [tailwindcss(), reactRouter()],
    cacheDir: env.VITE_CACHE_DIR || undefined,
    // Sadece herkese açık değerler (Turnstile site anahtarı gizli değildir; gizli anahtar API'de kalır).
    define: {
      __TURNSTILE_SITE_KEY__: JSON.stringify(env.TURNSTILE_SITE_KEY ?? ''),
      __RECAPTCHA_SITE_KEY__: JSON.stringify(env.RECAPTCHA_SITE_KEY ?? ''),
    },
    resolve: { alias: workspaceAliases() },
    // İlk ziyarette 'yeni bağımlılık bulundu, sayfa yeniden yükleniyor' olmasın (e2e kararlılığı)
    optimizeDeps: {
      include: [
        '@dnd-kit/core',
        '@hookform/resolvers/zod',
        '@tanstack/react-query',
        'class-variance-authority',
        'clsx',
        'dompurify',
        'i18next',
        'lucide-react',
        'radix-ui',
        'react-hook-form',
        'react-i18next',
        'recharts',
        'sonner',
        '@tiptap/extension-table',
        '@tiptap/pm/model',
        '@tiptap/react',
        '@tiptap/starter-kit',
        'tailwind-merge',
        'zod',
      ],
    },
    server: {
      port,
      strictPort: true,
      // Tarayıcı API'ye aynı origin üzerinden erişir: çerezler SameSite=Strict ile çalışır, CORS gerekmez.
      proxy: { '/api': { target: apiUrl, xfwd: true } },
      fs: { allow: [repoRoot] },
    },
  };
});
