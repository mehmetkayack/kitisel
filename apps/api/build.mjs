// Production paketi: workspace paketleri (TypeScript kaynak) gömülür, npm bağımlılıkları dışarıda kalır.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@upvine/'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  jsx: 'automatic',
  external,
  // Kaynak kodda da `createRequire` içe aktarılabildiği için takma adla (aksi hâlde "already been declared")
  banner: { js: "import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);" },
});
console.warn('✓ api built → dist/index.js');
