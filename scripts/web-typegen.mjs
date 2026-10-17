// Web tip kontrolünden önce React Router tiplerini üretir.
// - Dev sunucusu açıksa (`.dev-running` kilidi, bkz. web-dev.mjs): klasöre dokunulmaz; dev sunucusu
//   tipleri zaten güncel tutar. exFAT/Windows'ta izlenen klasörü silmek EPERM ve yarım silme üretiyordu.
// - Kapalıysa: .react-router silinir ve `react-router typegen` çalışır.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Paket `exports` alanı bin dosyasını dışa açmıyor; hoisted node_modules'tan doğrudan yol.
const REACT_ROUTER_BIN = fileURLToPath(new URL('../node_modules/@react-router/dev/bin.cjs', import.meta.url));

function devServerRunning() {
  if (!existsSync('.dev-running')) return false;
  const pid = Number(readFileSync('.dev-running', 'utf8'));
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false; // kalıntı kilit
  }
}

if (devServerRunning() && existsSync('.react-router/types')) {
  console.warn('! Dev sunucusu açık: onun ürettiği React Router tipleriyle devam ediliyor.');
  process.exit(0);
}

rmSync('.react-router', { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
execFileSync(process.execPath, [REACT_ROUTER_BIN, 'typegen'], { stdio: 'inherit' });
