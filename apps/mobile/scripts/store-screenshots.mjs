#!/usr/bin/env node
/**
 * App Store screenshots of the shell (iPhone 6.7", 1290x2796), taken from the production web app the
 * shell loads, in the shell's own surface (no sign-up link, no price, no checkout: the same W-7 rule the
 * native shell enforces). Playwright, viewport 430x932 at deviceScaleFactor 3, mobile user agent.
 *
 *   STORE_SHOTS_STORAGE_STATE=/path/outside/the/repo/state.json node scripts/store-screenshots.mjs
 *
 * `@playwright/test` is the root devDependency of the web repo; this folder installs none, so run it from a
 * checkout where `npm ci` ran at the root (or with a node_modules reachable from this file).
 *
 * The session is a Playwright storage state of a signed-in https://app.iterahq.dev (a file, never committed,
 * never printed). Without it only the signed-out screen is captured and the rest prints "not run". Make the
 * state by signing in once with "Entrar com DFL" in a Playwright context and saving `context.storageState()`.
 *
 * What is real and what is not: every screen is the production page. The shell surface is reproduced by
 * answering the page's bridge `hello` with a refusal (the page treats any native reply as "inside the shell",
 * `src/lib/shellReply.ts`), so the web-only blocks stay hidden exactly as in the app; the native status bar
 * and home indicator are not drawn. The profile photo requests are answered with a neutral 1x1 image so no person's
 * face is in an image. Nothing is mocked: a screen that cannot be reached is skipped.
 *
 * The lesson steps WRITE progress for the signed-in account (an answered exercise is saved). Use a
 * review or demo account for the session, not a person's own.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ORIGIN = 'https://app.iterahq.dev';
export const DISPLAY_TYPE = 'APP_IPHONE_67';
export const VIEWPORT = { width: 430, height: 932 };
export const SCALE = 3;
export const EXPECTED = { width: 1290, height: 2796 };
/** A 1x1 PNG in the brand's soft evergreen (#1C3A2A): what the profile photo requests are answered with. */
const NEUTRAL_AVATAR = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQsdICAAD2AIELjFZRAAAAAElFTkSuQmCC', 'base64');
export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** The ordered shots. `needsSession` shots are skipped when no storage state is given. */
export const SHOTS = [
  { slug: 'login', needsSession: false },
  { slug: 'trail', needsSession: true },
  { slug: 'catalog', needsSession: true },
  { slug: 'exercise', needsSession: true },
  { slug: 'feedback', needsSession: true },
];

/** Pure: `NN-slug.png`, two digits from 1. */
export function shotFileName(index, slug) {
  return `${String(index + 1).padStart(2, '0')}-${slug}.png`;
}

/** The script the page runs before its own code: a native side that answers `hello` with a refusal. */
export function shellStandInScript() {
  return `globalThis.ReactNativeWebView = { postMessage(raw) { try { const e = JSON.parse(raw); if (e.kind === 'hello') setTimeout(() => globalThis.postMessage(JSON.stringify({ tag: 'dfl-bridge', v: 1, kind: 'refusal', id: e.id, reason: 'capability_absent' }), '*'), 0); } catch (_) {} } };`;
}

/** Pure: width, height and colour type from the IHDR of a PNG buffer. Colour types 4 and 6 carry alpha. */
export function pngInfo(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 26 || sig.some((b, i) => buf[i] !== b) || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG');
  }
  const colorType = buf[25];
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType, hasAlpha: colorType === 4 || colorType === 6 };
}

async function settle(page, ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function main() {
  const { chromium } = await import('@playwright/test');
  const statePath = process.env.STORE_SHOTS_STORAGE_STATE;
  const outRoot = process.env.STORE_SHOTS_OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'store', 'screenshots', 'pt-BR', DISPLAY_TYPE);
  mkdirSync(outRoot, { recursive: true });
  const browser = await chromium.launch();
  const written = [];

  const open = async (storageState) => {
    const ctx = await browser.newContext({
      storageState,
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
      isMobile: true,
      hasTouch: true,
      userAgent: MOBILE_UA,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      reducedMotion: 'reduce',
    });
    await ctx.addInitScript(shellStandInScript());
    await ctx.route('**/*', (route) => {
      const req = route.request();
      return req.resourceType() === 'image' && /avatar/i.test(req.url())
        ? route.fulfill({ contentType: 'image/png', body: NEUTRAL_AVATAR })
        : route.continue();
    });
    return ctx;
  };

  const save = async (page, index, slug) => {
    const file = path.join(outRoot, shotFileName(index, slug));
    const buf = await page.screenshot({ type: 'png' });
    const info = pngInfo(buf);
    if (info.width !== EXPECTED.width || info.height !== EXPECTED.height || info.hasAlpha) {
      throw new Error(`${slug}: ${info.width}x${info.height} alpha=${info.hasAlpha}, expected ${EXPECTED.width}x${EXPECTED.height} without alpha`);
    }
    writeFileSync(file, buf);
    written.push(file);
    console.log(`wrote ${path.relative(process.cwd(), file)}`);
  };

  try {
    const anon = await open(undefined);
    const login = await anon.newPage();
    await login.goto(`${ORIGIN}/login`);
    await settle(login);
    await login.evaluate(() => globalThis.document.activeElement?.blur());
    await save(login, 0, 'login');
    await anon.close();

    if (!statePath) {
      console.log('not run: trail, catalog, exercise, feedback (STORE_SHOTS_STORAGE_STATE is not set)');
      return;
    }
    const ctx = await open(JSON.parse(readFileSync(statePath, 'utf8')));
    const page = await ctx.newPage();

    await page.goto(`${ORIGIN}/catalog`);
    await settle(page);
    await page.getByTestId('catalog-open').nth(1).click();
    await page.waitForURL(/\/program\//);
    await settle(page, 3500);
    await save(page, 1, 'trail');

    await page.goto(`${ORIGIN}/catalog`);
    await settle(page);
    await save(page, 2, 'catalog');

    await page.goBack();
    await settle(page, 3000);
    await page.getByRole('button', { name: /Começar|Continuar|Retomar/ }).first().click();
    await page.waitForURL(/\/lesson\//);
    const quiz = await page.getByTestId('quiz-submit').waitFor({ timeout: 20000 }).then(() => true, () => false);
    if (!quiz) {
      console.log('not run: exercise, feedback (the lesson is not at a single-choice quiz; progress is saved per account, use a fresh review account)');
      return;
    }
    await settle(page, 1500);
    await save(page, 3, 'exercise');

    // Try the options in order until the answer is accepted; only a correct answer is photographed.
    const options = page.getByTestId('quiz-option');
    const count = await options.count();
    for (let i = 0; i < count; i += 1) {
      await options.nth(i).click();
      await page.getByTestId('quiz-submit').click();
      await page.waitForTimeout(1500);
      if (await page.getByText('Resposta correta').count()) {
        await save(page, 4, 'feedback');
        break;
      }
      await page.getByRole('button', { name: /^(Continuar|Tentar de novo)/ }).first().click().catch(() => {});
      await page.waitForTimeout(800);
    }
    if (written.length < SHOTS.length) console.log('not run: feedback (no option was accepted as correct)');
    await ctx.close();
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`store-screenshots: ${e.message}`);
    process.exit(1);
  });
}
