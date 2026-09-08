import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { runCommand, withStampPreview } from '../stamp-preview.mjs';

async function fixture(t, body) {
  const root = await mkdtemp(join(tmpdir(), 'stamp-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist/index.html'), body);
  return { root, configFile: false, envFile: false, logLevel: 'silent' };
}

const closed = async (url) => assert.rejects(fetch(url), /fetch failed/);

test('two concurrent real previews retain distinct OS-assigned sockets and their own positive data', async (t) => {
  const options = await Promise.all([fixture(t, '<h1>first positive control</h1>'), fixture(t, '<h1>second positive control</h1>')]);
  const urls = [];
  let ready;
  const bothReady = new Promise((resolve) => { ready = resolve; });
  await Promise.all(options.map((option, index) => withStampPreview(option, async (url) => {
    urls[index] = url;
    if (urls.filter(Boolean).length === 2) ready();
    await bothReady;
    assert.notEqual(urls[0], urls[1]);
    assert.equal(new URL(url).hostname, '127.0.0.1');
    assert.notEqual(new URL(url).port, '0');
    assert.equal(await (await fetch(url)).text(), index === 0 ? '<h1>first positive control</h1>' : '<h1>second positive control</h1>');
  })));
  await Promise.all(urls.map(closed));
});

test('a test failure closes the owned preview', async (t) => {
  const options = await fixture(t, 'positive');
  let url;
  await assert.rejects(withStampPreview(options, async (actual) => {
    url = actual;
    assert.equal(await (await fetch(url)).text(), 'positive');
    throw new Error('test failed');
  }), /test failed/);
  await closed(url);
});

test('preview startup failure never starts tests', async (t) => {
  const options = await fixture(t, 'unused');
  options.plugins = [{ name: 'fixture-startup-failure', configurePreviewServer() { throw new Error('fixture startup failed'); } }];
  let called = false;
  await assert.rejects(withStampPreview(options, async () => { called = true; }));
  assert.equal(called, false);
});

test('a failed child exit is preserved and its preview closes', async (t) => {
  let url;
  const code = await withStampPreview(await fixture(t, 'positive'), async (actual) => {
    url = actual;
    return runCommand(process.execPath, ['-e', 'process.exit(7)']);
  });
  assert.equal(code, 7);
  await closed(url);
});

test('abort terminates only the owned child and closes its preview', async (t) => {
  const controller = new AbortController();
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  t.after(() => unrelated.kill());
  const options = await fixture(t, 'positive');
  const readyPath = join(options.root, 'child-ready');
  let url;
  const result = await withStampPreview(options, async (actual) => {
    url = actual;
    const running = runCommand(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], String(process.pid));setInterval(() => {}, 1000)', readyPath], { signal: controller.signal });
    let ownedPid;
    const deadline = Date.now() + 5000;
    while (!ownedPid && Date.now() < deadline) {
      try { ownedPid = Number(await readFile(readyPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!ownedPid) await delay(10);
    }
    assert.ok(ownedPid, 'the real test child must start before cancellation');
    assert.doesNotThrow(() => process.kill(ownedPid, 0));
    controller.abort();
    return running;
  }, controller.signal);
  assert.equal(result, 143);
  assert.equal(unrelated.exitCode, null);
  assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
  await closed(url);
});

test('an already aborted launch never starts its callback', async (t) => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(withStampPreview(await fixture(t, 'unused'), () => { called = true; }, controller.signal), { name: 'AbortError' });
  assert.equal(called, false);
});

test('a spawn error is returned to the caller', async () => {
  await assert.rejects(runCommand('/nonexistent-stamp-test-command', []), /ENOENT/);
});

test('a failed parent terminates its lingering descendant and preserves an unrelated process', async (t) => {
  const options = await fixture(t, 'unused');
  const readyPath = join(options.root, 'descendant-ready');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  t.after(() => unrelated.kill());
  const descendantSource = `
    const http = require('node:http');
    const fs = require('node:fs');
    const server = http.createServer((req, res) => res.end('owned descendant positive'));
    server.listen(0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port;
      http.get(url, (res) => { res.resume(); res.on('end', () => {
        fs.writeFileSync(process.argv[1], JSON.stringify({ pid: process.pid, url }));
      }); });
    });
  `;
  const parentSource = `
    const child = require('node:child_process').spawn(process.execPath, ['-e', process.argv[1], process.argv[2]], { stdio: 'ignore' });
    child.unref();
    const timer = setInterval(() => { if (require('node:fs').existsSync(process.argv[2])) { clearInterval(timer); process.exit(7); } }, 10);
  `;
  const code = await runCommand(process.execPath, ['-e', parentSource, descendantSource, readyPath]);
  const owned = JSON.parse(await readFile(readyPath, 'utf8'));
  t.after(() => { try { process.kill(owned.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } });
  assert.equal(code, 7);
  let stopped = false;
  const deadline = Date.now() + 1000;
  while (!stopped && Date.now() < deadline) {
    try { await fetch(owned.url); await delay(10); } catch { stopped = true; }
  }
  assert.equal(stopped, true, 'the failed parent must not leave its owned HTTP descendant running');
  assert.equal(unrelated.exitCode, null);
  assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
});

test('abort during pending preview startup skips tests and closes the eventual socket', async (t) => {
  const options = await fixture(t, 'pending startup positive');
  const controller = new AbortController();
  let entered;
  const starting = new Promise((resolve) => { entered = resolve; });
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let url;
  options.plugins = [{ name: 'pending-preview-startup', async configurePreviewServer(server) {
    server.httpServer.once('listening', () => { url = `http://127.0.0.1:${server.httpServer.address().port}`; });
    entered();
    await barrier;
  } }];
  let called = false;
  const run = withStampPreview(options, () => { called = true; }, controller.signal);
  const refused = assert.rejects(run, { name: 'AbortError' });
  await starting;
  controller.abort();
  release();
  await refused;
  assert.equal(called, false);
  assert.ok(url, 'the delayed real Vite socket must open before its cleanup is verified');
  await closed(url);
});
