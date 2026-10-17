import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { E2E_DATABASE, E2E_ENCRYPTION_KEY, E2E_QUEUE_PREFIX } from './env';

const TSX = fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url));
const WORKER = fileURLToPath(new URL('../../worker/src/index.ts', import.meta.url));

/**
 * E2E worker'ı (site analizi, konu önerisi): sahte site + sahte yapay zekâ, ayrı kuyruk öneki ve veritabanı.
 * Playwright `webServer` yerine burada başlatılır: Windows'ta webServer süreç ağacını kapatamayıp
 * test çalıştırmasını sonsuza kadar bekletiyordu. Kapatma süreç ağacıyla birlikte yapılır.
 */
export async function startE2EWorker(): Promise<() => Promise<void>> {
  const child = spawn(process.execPath, [TSX, WORKER], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      MYSQL_DATABASE: E2E_DATABASE,
      LOG_LEVEL: 'info',
      QUEUE_PREFIX: E2E_QUEUE_PREFIX,
      E2E_FAKE_EXTERNALS: 'true',
      ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
      ARTICLE_QUOTA_OVERRIDE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (d: Buffer) => process.stderr.write(`[worker] ${d.toString()}`));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`E2E worker başlamadı:\n${output}`)), 60_000);
    child.stdout.on('data', (d: Buffer) => {
      output += d.toString();
      if (output.includes('worker started')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`E2E worker kapandı (${code}):\n${output}`)));
  });
  // Hata ayıklama için uyarı ve hatalar görünsün.
  child.stdout.on('data', (d: Buffer) => {
    const text = d.toString();
    if (/WARN|ERROR/.test(text)) process.stdout.write(`[worker] ${text}`);
  });

  return async () => {
    if (child.exitCode !== null || !child.pid) return;
    if (process.platform === 'win32') {
      try {
        // Tam yol: System32 PATH'te olmayan kabuklarda da çalışsın.
        const taskkill = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\taskkill.exe`;
        execFileSync(taskkill, ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // zaten kapanmış
      }
    } else {
      child.kill('SIGTERM');
    }
  };
}
