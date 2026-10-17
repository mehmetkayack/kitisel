// `react-router dev` sarmalayıcısı. Çalışırken `.dev-running` kilit dosyasına PID yazar;
// `scripts/web-typegen.mjs` bu kilidi görünce .react-router klasörüne dokunmaz (dev sunucusu
// tipleri güncel tutar; exFAT/Windows'ta izlenen klasörü silmek EPERM ve yarım silme üretir).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCK = '.dev-running';
// Paket `exports` alanı bin dosyasını dışa açmıyor; hoisted node_modules'tan doğrudan yol.
const REACT_ROUTER_BIN = fileURLToPath(new URL('../node_modules/@react-router/dev/bin.cjs', import.meta.url));

function runningPid() {
  if (!existsSync(LOCK)) return null;
  const pid = Number(readFileSync(LOCK, 'utf8'));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null; // kalıntı kilit
  }
}

// Başka bir dev sunucusu çalışıyorsa onun kilidine ve tip klasörüne dokunmadan çık
// (aksi halde bu süreç çıkarken çalışan sunucunun kilidini silip typecheck'i bozuyordu).
const other = runningPid();
if (other !== null && other !== process.pid) {
  console.error(`! Web dev sunucusu zaten çalışıyor (PID ${other}). Önce onu kapatın.`);
  process.exit(1);
}

try {
  rmSync('.react-router', { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
} catch {
  // Eski bir sürecin kilidi olabilir; react-router kendi yeniden denemeleriyle üzerine yazar.
}

writeFileSync(LOCK, String(process.pid));
const release = () => {
  // Sadece kendi kilidimizi sil.
  if (existsSync(LOCK) && Number(readFileSync(LOCK, 'utf8')) === process.pid) rmSync(LOCK, { force: true });
};

const child = spawn(process.execPath, [REACT_ROUTER_BIN, 'dev', ...process.argv.slice(2)], { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => {
  release();
  process.exit(code ?? 0);
});
