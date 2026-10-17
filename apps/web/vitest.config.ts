import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../scripts/workspace-aliases.ts';

// React Router Vite eklentisi Vitest ile birlikte çalışmaz; testler için ayrı yapılandırma.
export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: { include: ['app/**/*.test.{ts,tsx}'], environment: 'node' },
});
