/**
 * Does the field a learner is typing in stay visible when the phone keyboard is up?
 *
 * Three keyboards, because of two kinds of phone:
 *  A. "resize" — the layout viewport gets shorter (Android WebView in the shell,
 *     Chrome with `interactive-widget=resizes-content`). Stood for by
 *     `setViewportSize`.
 *  B. "visual only" — the layout viewport keeps its height and only
 *     `window.visualViewport` shrinks (iOS Safari / WKWebView, Android Chrome by
 *     default). Stood for by an init script that replaces `window.visualViewport`
 *     with a faithful stub: `height`, `offsetTop`, `pageTop`, `resize`/`scroll`
 *     events, shrunk in three steps after a focus on an editable element and
 *     restored on blur.
 *  C. "pan" — B, and the last step also moves `offsetTop` the way iOS pans the page
 *     to a clipped field. A field the pan already made visible must not move again.
 *
 * Each case is opened at 390x844 (336 px keyboard) and 390x640 (260 px), the field
 * is tapped for real, and the page is read after it settled: the field must be
 * fully inside the visible area, with nothing over it. `KEYBOARD_RECORD=<dir>`
 * writes one JSON per case.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { CODE_NO_CHECKS, CODE_WITH_CHECKS, DOCUMENT_REFLECTION, TERMINAL_FREE_TEXT, type ActivityFixture } from './support/activityFixtures';
import { open } from './support/heightMeasure';
import { installSupabaseStub } from './support/harnessStub';
import { LIVE_TYPE } from './support/sceneFixtures';
import { CODE_FILL_TYPE, CHAT_FILL_TYPE, DOCUMENT_REFLECT, QUESTION_WRITE } from './support/keyboardFixtures';

const SETUPS = [
  { name: '844', viewport: { width: 390, height: 844 }, keyboard: 336 },
  { name: '640', viewport: { width: 390, height: 640 }, keyboard: 260 },
];

const EDITABLE =
  'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="hidden"])';

interface Surface {
  label: string;
  fx?: ActivityFixture;
  route?: string;
  /** Where the finger lands; defaults to the field. */
  tap?: string;
  field: string;
}

const IN_CARD = `[data-testid="lesson-activity"] :is(${EDITABLE})`;
const MONACO = { tap: '.monaco-editor .view-lines', field: '.monaco-editor textarea' };

const SURFACES: Surface[] = [
  { label: 'document reflection', fx: DOCUMENT_REFLECTION, field: IN_CARD },
  { label: 'document_reflect', fx: DOCUMENT_REFLECT, field: IN_CARD },
  { label: 'question_write', fx: QUESTION_WRITE, field: IN_CARD },
  { label: 'code_fill_type', fx: CODE_FILL_TYPE, field: IN_CARD },
  { label: 'chat_fill_type', fx: CHAT_FILL_TYPE, field: IN_CARD },
  { label: 'terminal_sandbox free text', fx: TERMINAL_FREE_TEXT, field: '[data-testid="terminal-input"]' },
  { label: 'live_type', fx: LIVE_TYPE, field: '[data-testid="live-type-input"]' },
  { label: 'code (Monaco, no checks)', fx: CODE_NO_CHECKS, ...MONACO },
  { label: 'code with checks (Monaco)', fx: CODE_WITH_CHECKS, ...MONACO },
  { label: '/login', route: '/login', field: 'input[type="email"]' },
  { label: '/auth/code', route: '/auth/code', field: 'input[type="email"]' },
  { label: '/auth/forgot', route: '/auth/forgot', field: 'input[type="email"]' },
];

/**
 * `window.visualViewport` that shrinks by `keyboard` px while an editable element has focus.
 * The transition takes three steps, each firing `resize` and `scroll`, like a keyboard animating.
 * With `pan`, the last step also moves `offsetTop` the way iOS pans the page to a clipped field.
 */
function installVisualViewportStub(page: Page, keyboard: number, pan: boolean) {
  return page.addInitScript(
    ({ keyboard, pan }) => {
      const target = new EventTarget();
      let inset = 0;
      let offsetTop = 0;
      let run = 0;
      const fire = () => {
        target.dispatchEvent(new Event('resize'));
        target.dispatchEvent(new Event('scroll'));
      };
      const to = (next: number) => {
        if (next === inset) return;
        const from = inset;
        const mine = ++run;
        [1, 2, 3].forEach((step) =>
          setTimeout(() => {
            if (mine !== run) return;
            inset = Math.round(from + ((next - from) * step) / 3);
            if (step === 3) {
              const el = document.activeElement;
              const bottom = el && next > 0 ? el.getBoundingClientRect().bottom : 0;
              offsetTop = pan && next > 0 ? Math.min(next, Math.max(0, bottom + 16 - (window.innerHeight - next))) : 0;
            }
            fire();
          }, step * 40),
        );
      };
      const editable = (el: EventTarget | null) =>
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|range|hidden)$/.test(el.type)));
      document.addEventListener('focusin', (e) => editable(e.target) && to(keyboard), true);
      document.addEventListener('focusout', () => setTimeout(() => !editable(document.activeElement) && to(0), 50), true);
      const stub = {
        get width() { return window.innerWidth; },
        get height() { return window.innerHeight - inset; },
        get offsetTop() { return offsetTop; },
        offsetLeft: 0,
        get pageTop() { return window.scrollY + offsetTop; },
        get pageLeft() { return window.scrollX; },
        scale: 1,
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
      };
      Object.defineProperty(window, 'visualViewport', { value: stub, configurable: true });
    },
    { keyboard, pan },
  );
}

async function openSurface(page: Page, surface: Surface, viewport: { width: number; height: number }) {
  if (surface.fx) return open(page, surface.fx, viewport);
  await page.setViewportSize(viewport);
  await installSupabaseStub(page, []);
  await page.goto(surface.route!);
  await expect(page.locator(surface.field).first()).toBeVisible();
  await page.waitForTimeout(500);
}

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** How long the page gets to react to the keyboard before it is read. */
const SETTLE_MS = 400;

function probe(page: Page, field: string) {
  return page.evaluate((field) => {
    const vv = window.visualViewport!;
    const el = [...document.querySelectorAll<HTMLElement>(field)].find((e) => e.getBoundingClientRect().height > 0) ?? null;
    if (!el) return { found: false as const };
    const r = el.getBoundingClientRect();
    const visibleTop = vv.offsetTop;
    const visibleBottom = vv.offsetTop + vv.height;
    const owner = el.closest('.monaco-editor') ?? el;
    const name = (n: Element | null) => (n ? (n.getAttribute('data-testid') ?? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}`) : null);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const inLayout = cy >= 0 && cy <= window.innerHeight && cx >= 0 && cx <= window.innerWidth;
    const hit = inLayout ? document.elementFromPoint(cx, cy) : null;
    const centre = !inLayout ? 'outside-layout' : cy > visibleBottom ? 'under-keyboard' : hit && owner.contains(hit) ? 'field' : name(hit);
    const fixed = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((e) => getComputedStyle(e).position === 'fixed')
      .map((e) => ({ e, box: e.getBoundingClientRect() }))
      .filter(({ box }) => box.height > 1 && box.width > 1);
    const overField = fixed.filter(({ e, box }) => box.top < r.bottom && box.bottom > r.top && box.left < r.right && box.right > r.left && !e.contains(el));
    const root = document.documentElement;
    return {
      found: true as const,
      field: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
      visible: { top: Math.round(visibleTop), bottom: Math.round(visibleBottom) },
      innerHeight: window.innerHeight,
      fullyVisible: r.top >= visibleTop && r.bottom <= visibleBottom,
      centre,
      fixedOverField: overField.map(({ e }) => name(e)),
      fixedBars: fixed.map(({ e, box }) => ({ name: name(e), top: Math.round(box.top), bottom: Math.round(box.bottom) })),
      scrollY: Math.round(window.scrollY),
      canScroll: root.scrollHeight > window.innerHeight + 1,
      overflow: Math.max(0, root.scrollHeight - window.innerHeight),
      keyboardInset: root.style.getPropertyValue('--keyboard-inset') || null,
    };
  }, field);
}

type Probe = Awaited<ReturnType<typeof probe>>;

async function run(page: Page, surface: Surface, model: 'resize' | 'visual' | 'pan', setup: (typeof SETUPS)[number]) {
  await openSurface(page, surface, setup.viewport);
  const before = await probe(page, surface.field);
  const target = page.locator(surface.tap ?? surface.field).first();
  const editing = () => page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, EDITABLE);
  await target.tap();
  let gesture = 'tap';
  // Monaco ignores a synthetic touch tap; a click on the same spot is the next-closest user gesture.
  if (!(await editing())) {
    await target.click();
    gesture = 'click';
  }
  if (!(await editing())) {
    await page.locator(surface.field).first().focus();
    gesture = 'focus()';
  }
  if (model === 'resize') {
    await page.setViewportSize({ width: setup.viewport.width, height: setup.viewport.height - setup.keyboard });
  }
  await frames(page);
  await page.waitForTimeout(SETTLE_MS);
  const after = await probe(page, surface.field);
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? `${a.tagName.toLowerCase()}${a.className && typeof a.className === 'string' && a.className.includes('inputarea') ? '.inputarea' : ''}` : null;
  });
  return { model, setup: setup.name, keyboard: setup.keyboard, gesture, focused, before, after } as { model: string; setup: string; keyboard: number; gesture: string; focused: string | null; before: Probe; after: Probe };
}

test.describe('the keyboard goes away', () => {
  for (const pan of [false, true]) {
    test(`the room made for the keyboard is given back and nothing is left scrolled (pan: ${pan})`, async ({ page }) => {
      await installVisualViewportStub(page, 336, pan);
      await open(page, DOCUMENT_REFLECTION, SETUPS[0].viewport);
      const state = () =>
        page.evaluate((field) => {
          const el = document.querySelector(field)!;
          const tops: Record<string, number> = {};
          for (let a = el.parentElement; a; a = a.parentElement) {
            if (a.scrollTop) tops[a.getAttribute('data-testid') ?? a.tagName] = a.scrollTop;
          }
          const root = document.documentElement;
          return {
            inset: root.style.getPropertyValue('--keyboard-inset'),
            scrollY: window.scrollY,
            overflow: Math.max(0, root.scrollHeight - window.innerHeight),
            ancestorScrollTops: tops,
          };
        }, IN_CARD);
      const idle = await state();
      await page.locator(IN_CARD).first().tap();
      await page.waitForTimeout(SETTLE_MS);
      expect((await state()).inset).toBe('368px');
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      await page.waitForTimeout(SETTLE_MS);
      const closed = await state();
      expect(closed.inset).toBe('0px');
      expect(closed.overflow).toBe(idle.overflow);
      expect(closed.scrollY).toBeLessThanOrEqual(closed.overflow);
      expect(closed.ancestorScrollTops).toEqual(idle.ancestorScrollTops);
    });
  }
});

test.describe('the field being typed in stays visible above the phone keyboard', () => {
  for (const surface of SURFACES) {
    test(`${surface.label}`, async ({ context }) => {
      test.setTimeout(150_000);
      const runs = [];
      for (const setup of SETUPS) {
        for (const model of ['resize', 'visual', 'pan'] as const) {
          const page = await context.newPage();
          try {
            if (model !== 'resize') await installVisualViewportStub(page, setup.keyboard, model === 'pan');
            runs.push(await run(page, surface, model, setup));
          } finally {
            await page.close();
          }
        }
      }
      const dir = process.env.KEYBOARD_RECORD;
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
        const file = surface.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify({ label: surface.label, runs }, null, 1));
      }
      for (const r of runs) {
        const where = `${surface.label}, ${r.model} keyboard of ${r.keyboard} px at ${r.setup}`;
        const a = r.after;
        expect(a.found, `${where}: no field found after the tap`).toBe(true);
        if (!a.found) continue;
        expect(a.fullyVisible, `${where}: the field is ${a.field.top}-${a.field.bottom}, the visible area ends at ${a.visible.bottom}`).toBe(true);
        expect(a.centre, `${where}: what is under the middle of the field`).toBe('field');
        expect(a.fixedOverField, `${where}: a fixed bar covers the field`).toEqual([]);
        const b = r.before;
        if (b.found && b.field.top >= a.visible.top && b.field.bottom <= a.visible.bottom) {
          expect(a.scrollY, `${where}: the field was already visible and the page moved`).toBe(b.scrollY);
        }
      }
    });
  }
});
