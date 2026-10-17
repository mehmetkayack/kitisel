/**
 * Bölüm 6.2 / 14: bileşenlerde ham renk kodu kullanılmaz, sadece token'lar.
 * Ham hex/rgb/hsl renkleri sadece izin verilen dosyalarda bulunabilir.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { repoRoot } from './workspace-aliases.ts';

const SCAN = ['apps/web/app', 'packages/ui/src', 'packages/email/src'];
const ALLOWED = new Set([
  'packages/ui/src/tokens.css', // token'ların tanımlandığı tek yer
  'packages/email/src/theme.ts', // e-posta istemcileri CSS değişkeni desteklemez (token değerlerinin kopyası)
]);
const EXT = /\.(tsx?|css)$/;
const RAW = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/g;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXT.test(entry)) yield full;
  }
}

const problems: string[] = [];
for (const base of SCAN) {
  for (const file of walk(join(repoRoot, base))) {
    const rel = relative(repoRoot, file).split(sep).join('/');
    if (ALLOWED.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // URL parçaları (#main gibi) yanlış alarm vermesin: sadece renk benzeri hex'ler
        for (const m of line.matchAll(RAW)) {
          if (m[0].startsWith('#') && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(m[0])) continue;
          if (m[0].startsWith('#') && /href=["']#|["']#[a-z]/.test(line) && !/[0-9]/.test(m[0])) continue;
          problems.push(`${rel}:${i + 1}  ${m[0]}  →  token kullanın (bkz. packages/ui/src/tokens.css)`);
        }
      });
  }
}

if (problems.length) {
  console.error(`✗ Ham renk kodu bulundu:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('✓ Ham renk kodu yok: tüm bileşenler token kullanıyor');
