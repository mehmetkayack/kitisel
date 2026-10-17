import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../scripts/workspace-aliases.ts';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Test veritabanı her çalıştırmada sıfırlanıp migration'larla kurulur (asıl veritabanına dokunmaz).
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
