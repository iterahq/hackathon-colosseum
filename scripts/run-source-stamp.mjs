import { runCommand, withStampPreview } from './stamp-preview.mjs';

const controller = new AbortController();
let caughtSignal;
const stop = (signal) => { caughtSignal = signal; controller.abort(); };
const onTerm = () => stop('SIGTERM');
const onInt = () => stop('SIGINT');
process.once('SIGTERM', onTerm);
process.once('SIGINT', onInt);
// Keep the previous Playwright webServer startup budget.
const startupTimer = setTimeout(() => controller.abort(), 300_000);
try {
  const env = {
    ...process.env,
    ITERA_SOURCE_STAMP: '1',
    VITE_SUPABASE_URL: 'http://stub.supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
  };
  const buildCode = await runCommand('npm', ['run', 'build'], { env, signal: controller.signal });
  if (buildCode !== 0) process.exitCode = buildCode;
  else {
    process.exitCode = await withStampPreview({}, (url) => {
      clearTimeout(startupTimer);
      return runCommand(process.execPath, [
        'node_modules/playwright/cli.js', 'test', '--config', 'playwright.stamp.config.ts', ...process.argv.slice(2),
      ], { signal: controller.signal, env: { ...env, STAMP_MANAGED_PREVIEW_URL: url } });
    }, controller.signal);
  }
} catch (error) {
  if (!caughtSignal) console.error(error);
  process.exitCode = caughtSignal === 'SIGINT' ? 130 : caughtSignal ? 143 : 1;
} finally {
  clearTimeout(startupTimer);
  if (caughtSignal) process.exitCode = caughtSignal === 'SIGINT' ? 130 : 143;
  process.removeListener('SIGTERM', onTerm);
  process.removeListener('SIGINT', onInt);
}
