// Production: migration ve yönetim komutları (`up`, `down`, `grant-admin`) tsx olmadan çalışsın diye tek dosya.
// Workspace paketleri (TypeScript kaynak) gömülür, npm bağımlılıkları dışarıda kalır.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies ?? {})];

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external,
  // Kaynak kodda da `createRequire` içe aktarılabildiği için takma adla (aksi hâlde "already been declared")
  banner: { js: "import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);" },
});
console.warn('✓ db cli built → dist/cli.js');
