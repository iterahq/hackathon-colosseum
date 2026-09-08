import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { preview } from 'vite';

/** The actual preview socket stays bound from discovery through test completion. */
export async function withStampPreview(options, run, signal) {
  signal?.throwIfAborted();
  const server = await preview({
    ...options,
    preview: { ...options.preview, host: '127.0.0.1', port: 0, strictPort: true, open: false },
  });
  try {
    signal?.throwIfAborted();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1' || address.port < 1) {
      throw new Error('The stamp preview did not bind its own loopback TCP socket');
    }
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    // Vite can leave browser keep-alive connections open after a failed test.
    server.httpServer.closeAllConnections();
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
  }
}

/** Own one process group, including browser/build children, for cancellation. */
export function runCommand(command, args, { signal, env = process.env } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit', detached: process.platform !== 'win32' });
    let escalation;
    const killOwnedGroup = (name) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(name);
        else process.kill(-child.pid, name);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const abort = () => {
      killOwnedGroup('SIGTERM');
      escalation = setTimeout(() => killOwnedGroup('SIGKILL'), 5000);
      escalation.unref();
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(escalation);
    };
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('close', (code, killedBy) => {
      // A failed parent can exit before a descendant. Stop leftovers in this
      // owned process group only, while preserving the original exit code.
      if (signal?.aborted || code !== 0) killOwnedGroup('SIGKILL');
      cleanup();
      resolve(code ?? 128 + (constants.signals[killedBy] ?? 1));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
