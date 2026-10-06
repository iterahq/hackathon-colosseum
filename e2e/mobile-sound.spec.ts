/**
 * The verdict sound must start with the verdict.
 *
 * Tainan, on an iPhone (2026-10-06): "o som está vindo um ou dois segundos
 * depois que eu acerto a atividade".
 *
 * The real lesson player opens over the stub origin, a single-choice answer is
 * submitted, and three instants are stamped inside the page: the tap, the
 * verdict footer entering the DOM, and the clip starting. What is ASSERTED is
 * order and network — the clip starts before the frame that paints the verdict,
 * from a decoded buffer, with no request for a clip at that moment. Milliseconds
 * are recorded (`SOUND_RECORD=<file>`), never asserted: a loaded CI runner would
 * turn them into flake.
 *
 * `SOUND_SLOW_4G=1` throttles the run (CDP on Chromium; a delayed clip response
 * on WebKit, which has no CDP). Neither engine here is an iPhone: no audio
 * session, no silent switch, no WKWebView.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { SINGLE_CHOICE } from './support/activityFixtures';
import { installLessonSubstrate, lessonUrl } from './support/lessonStub';

const SFX_DIR = path.resolve(process.cwd(), 'public/vendor/sfx');
const SUCCESS_BYTES = statSync(path.join(SFX_DIR, 'success.mp3')).size;
const SLOW_4G = { latencyMs: 562.5, downloadBps: (1.6 * 1024 * 1024) / 8, uploadBps: (750 * 1024) / 8 };
const THROTTLED = !!process.env.SOUND_SLOW_4G;
const CORRECT = 'Guardar uma informação que muda na tela';

interface Stamp {
  type: 'click' | 'verdict' | 'verdict-painted' | 'media.play' | 'media.playing' | 'buffer.start' | 'decode.done' | 'context.new';
  t: number;
  testid?: string;
  src?: string;
  duration?: number;
  state?: string;
  latencyMs?: number;
  bytes?: number;
}

declare global {
  interface Window {
    __sfx: Stamp[];
  }
}

function probe(): void {
  const stamps: Stamp[] = (window.__sfx = []);
  const stamp = (type: Stamp['type'], extra: Partial<Stamp> = {}) => stamps.push({ type, t: performance.now(), ...extra });

  window.addEventListener(
    'click',
    (event) => {
      const el = (event.target as Element | null)?.closest?.('[data-testid]');
      stamp('click', { testid: el?.getAttribute('data-testid') ?? '' });
    },
    true,
  );

  const watch = () => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector('[data-testid="feedback-footer"]')) return;
      observer.disconnect();
      stamp('verdict');
      requestAnimationFrame(() => stamp('verdict-painted'));
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) watch();
  else document.addEventListener('readystatechange', watch, { once: true });

  const mediaPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    const src = new URL(this.currentSrc || this.src, location.href).pathname;
    stamp('media.play', { src });
    this.addEventListener('playing', () => stamp('media.playing', { src }), { once: true });
    return mediaPlay.call(this);
  };

  const scope = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctx) return;

  const Wrapped = function (this: unknown, ...args: ConstructorParameters<typeof AudioContext>) {
    stamp('context.new');
    return Reflect.construct(Ctx, args, new.target ?? Wrapped);
  } as unknown as typeof AudioContext;
  Wrapped.prototype = Ctx.prototype;
  if (scope.AudioContext) scope.AudioContext = Wrapped;
  else scope.webkitAudioContext = Wrapped;

  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function patched(this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
    const ctx = this.context as AudioContext;
    stamp('buffer.start', {
      duration: this.buffer?.duration ?? 0,
      state: ctx.state,
      latencyMs: ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000,
    });
    return start.apply(this, args);
  };

  const decode = Ctx.prototype.decodeAudioData;
  Ctx.prototype.decodeAudioData = function patched(this: AudioContext, data: ArrayBuffer, ok?: DecodeSuccessCallback | null, fail?: DecodeErrorCallback | null) {
    const bytes = data.byteLength;
    const done = (buffer: AudioBuffer) => {
      stamp('decode.done', { bytes, duration: buffer.duration });
      ok?.(buffer);
    };
    const result = decode.call(this, data, done, fail) as Promise<AudioBuffer> | undefined;
    return result ?? (undefined as unknown as Promise<AudioBuffer>);
  };
}

async function throttle(page: Page, browserName: string): Promise<void> {
  if (!THROTTLED) return;
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: SLOW_4G.latencyMs,
      downloadThroughput: SLOW_4G.downloadBps,
      uploadThroughput: SLOW_4G.uploadBps,
    });
    return;
  }
  await page.route('**/vendor/sfx/*.mp3', async (route) => {
    const file = path.join(SFX_DIR, path.basename(new URL(route.request().url()).pathname));
    const body = readFileSync(file);
    await new Promise((resolve) => setTimeout(resolve, SLOW_4G.latencyMs + (body.length / SLOW_4G.downloadBps) * 1000));
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body });
  });
}

const stamps = (page: Page) => page.evaluate(() => window.__sfx);

test.describe('the verdict sound starts with the verdict', () => {
  test('a correct answer plays a preloaded clip: no request at the verdict, sound before the paint', async ({ page, browserName }, testInfo) => {
    test.setTimeout(THROTTLED ? 180_000 : 60_000);
    const clipRequests: { name: string; at: number }[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/vendor/sfx/')) clipRequests.push({ name: path.basename(url.pathname), at: Date.now() });
    });

    await page.addInitScript(probe);
    await throttle(page, browserName);
    await installLessonSubstrate(page, SINGLE_CHOICE);
    const openedAt = Date.now();
    await page.goto(lessonUrl(SINGLE_CHOICE), { timeout: THROTTLED ? 150_000 : 30_000 });
    await expect(page.getByTestId('lesson-activity')).toBeVisible({ timeout: THROTTLED ? 150_000 : 20_000 });
    const lessonVisibleAt = Date.now();

    // The first touch of the session: picking the option. A learner takes far
    // longer than a decode between this tap and the submit one.
    await page.getByTestId('single-choice-option').filter({ hasText: CORRECT }).tap();
    const preloaded = await page
      .waitForFunction((bytes) => window.__sfx.some((s) => s.type === 'decode.done' && s.bytes === bytes), SUCCESS_BYTES, {
        timeout: THROTTLED ? 60_000 : 15_000,
      })
      .then(() => true)
      .catch(() => false);
    const clipsReadyAt = Date.now();

    const requestsBeforeVerdict = clipRequests.length;
    await page.getByTestId('single-choice-submit').tap();
    await expect(page.getByTestId('feedback-footer')).toBeVisible();
    await page
      .waitForFunction(() => window.__sfx.some((s) => s.type === 'media.playing' || (s.type === 'buffer.start' && (s.duration ?? 0) > 0.1)), null, {
        timeout: THROTTLED ? 30_000 : 10_000,
      })
      .catch(() => undefined);
    await page.waitForTimeout(1_000);

    const all = await stamps(page);
    const submit = all.find((s) => s.type === 'click' && s.testid === 'single-choice-submit');
    const verdict = all.find((s) => s.type === 'verdict');
    const painted = all.find((s) => s.type === 'verdict-painted');
    const clipStart = all.find((s) => s.type === 'buffer.start' && (s.duration ?? 0) > 0.1 && s.t >= (submit?.t ?? 0));
    const mediaPlay = all.find((s) => s.type === 'media.play' && s.t >= (submit?.t ?? 0));
    const mediaPlaying = all.find((s) => s.type === 'media.playing' && s.t >= (submit?.t ?? 0));
    const requestsAtVerdict = clipRequests.slice(requestsBeforeVerdict).map((r) => r.name);

    const playCall = clipStart ?? mediaPlay;
    const soundStart = clipStart ? clipStart.t + (clipStart.latencyMs ?? 0) : mediaPlaying?.t;
    const round = (n: number | undefined) => (n === undefined ? null : Math.round(n * 10) / 10);
    const record = {
      project: testInfo.project.name,
      engine: browserName,
      throttled: THROTTLED ? 'slow-4g' : 'none',
      path: clipStart ? 'web-audio' : mediaPlay ? 'html-audio' : 'silent',
      preloaded,
      lessonVisibleMs: lessonVisibleAt - openedAt,
      clipsReadyAfterVisibleMs: preloaded ? clipsReadyAt - lessonVisibleAt : null,
      tapToVerdictMs: round(verdict && submit ? verdict.t - submit.t : undefined),
      verdictToPlayCallMs: round(verdict && playCall ? playCall.t - verdict.t : undefined),
      verdictToSoundStartMs: round(verdict && soundStart !== undefined ? soundStart - verdict.t : undefined),
      contextState: clipStart?.state ?? null,
      outputLatencyMs: round(clipStart?.latencyMs),
      clipRequestsAtVerdict: requestsAtVerdict,
      clipRequestsTotal: clipRequests.map((r) => r.name),
    };
    if (process.env.SOUND_RECORD) writeFileSync(process.env.SOUND_RECORD, `${JSON.stringify(record, null, 2)}\n`, { flag: 'a' });
    testInfo.annotations.push({ type: 'sound', description: JSON.stringify(record) });

    expect(preloaded, 'success.mp3 was never decoded before the verdict: the lesson did not preload its clips').toBe(true);
    expect(requestsAtVerdict, 'the verdict triggered a network request for a clip').toEqual([]);
    expect(mediaPlay, 'the verdict played through a media element instead of a decoded buffer').toBeUndefined();
    expect(clipStart, 'no decoded clip started after the submit tap').toBeDefined();
    expect(clipStart!.state).toBe('running');
    expect(submit && verdict && painted, 'tap, verdict and paint must all be stamped').toBeTruthy();
    expect(clipStart!.t, 'the clip must start after the tap').toBeGreaterThanOrEqual(submit!.t);
    expect(clipStart!.t, 'the clip must start before the frame that paints the verdict').toBeLessThanOrEqual(painted!.t);
  });

  test('a muted lesson fetches no clip and plays nothing', async ({ page }) => {
    const clipRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/vendor/sfx/')) clipRequests.push(path.basename(url.pathname));
    });
    await page.addInitScript(probe);
    await page.addInitScript(() => localStorage.setItem('itera.lesson.muted', '1'));
    await installLessonSubstrate(page, SINGLE_CHOICE);
    await page.goto(lessonUrl(SINGLE_CHOICE));
    await expect(page.getByTestId('lesson-activity')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('single-choice-option').first().tap();
    await page.getByTestId('single-choice-submit').tap();
    await expect(page.getByTestId('feedback-footer')).toBeVisible();
    await page.waitForTimeout(1_000);

    const all = await stamps(page);
    expect(clipRequests).toEqual([]);
    expect(all.filter((s) => s.type === 'media.play' || (s.type === 'buffer.start' && (s.duration ?? 0) > 0.1))).toEqual([]);
  });
});
