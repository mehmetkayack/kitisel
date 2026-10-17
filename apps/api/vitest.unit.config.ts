import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../scripts/workspace-aliases.ts';

/** Sadece birim testleri: veritabanı ve Redis gerektirmez (`pnpm --filter @upvine/api test:unit`). */
export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: { include: ['src/**/*.test.ts'] },
});
