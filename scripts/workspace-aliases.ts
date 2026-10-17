import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * tsconfig.base.json içindeki `paths` haritasından Vite/Vitest alias listesi üretir.
 * Workspace paketleri symlink yerine alias ile çözülür (D: exFAT, bkz. CLAUDE.md > Kararlar).
 * Tek doğruluk kaynağı tsconfig.base.json'dır; burada elle alias eklemeyin.
 */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface Alias {
  find: RegExp;
  replacement: string;
}

export function workspaceAliases(): Alias[] {
  const file = resolve(repoRoot, 'tsconfig.base.json');
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  const paths = (config as { compilerOptions?: { paths?: Record<string, string[]> } }).compilerOptions?.paths ?? {};

  return Object.entries(paths).map(([pattern, targets]) => {
    const target = resolve(repoRoot, targets[0] ?? '');
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    if (pattern.endsWith('/*')) {
      return {
        find: new RegExp(`^${escaped.slice(0, -2)}(.+)$`),
        replacement: target.replace(/\*$/, '$1'),
      };
    }
    return { find: new RegExp(`^${escaped}$`), replacement: target };
  });
}
