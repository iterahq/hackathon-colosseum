/**
 * Two bugs filmed on an iPhone (2026-10-05), stated as what the UI must do.
 *
 * 1. A press held on an exercise must not select its text or raise the iOS
 *    callout — while reading text and typing fields stay selectable.
 * 2. The enlarged lesson image opens with the whole picture inside the visible
 *    viewport, over a backdrop that covers the page, with the page scroll locked.
 *
 * And one found on production the same day: outside `/login`, the auth forms
 * had 34 px buttons and 13 px fields (iOS zooms the page on those).
 *
 * Hermetic, same substrate as the activity baseline. It runs on the `mobile`
 * project (Chromium, touch) on every PR; `BASELINE_WEBKIT=1` adds an `iphone`
 * project for a local WebKit run. Neither is a real iPhone: no engine here
 * shows the callout itself, so what is measured is the selection a press can
 * produce and the declarations that switch the callout off.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  CONCEPT,
  DOCUMENT_REFLECTION,
  MATCH,
  MULTI_CHOICE,
  ORDER,
  QUIZ,
  SINGLE_CHOICE,
  type ActivityFixture,
} from './support/activityFixtures';
import { installHarnessSubstrate, installSupabaseStub, harnessUrl } from './support/harnessStub';
import { LIVE_TYPE, SCENE_TARGETS, fixture } from './support/sceneFixtures';

interface Surface {
  fx: ActivityFixture;
  /** An element with text inside the surface the gesture lands on. */
  target: string;
  gesture: string;
}

const SURFACES: Surface[] = [
  { fx: ORDER, target: '[data-testid="order-item"]', gesture: 'drag a row' },
  { fx: MATCH, target: '[data-testid="match-left-card"]', gesture: 'drag a wire / tap a pair' },
  ...SCENE_TARGETS,
  { fx: SINGLE_CHOICE, target: '[data-testid="single-choice-option"]', gesture: 'tap an option' },
  { fx: MULTI_CHOICE, target: '[data-testid="multi-choice-option"]', gesture: 'tap options' },
  { fx: QUIZ, target: '[data-testid="quiz-option"]', gesture: 'tap an option' },
];

const svg = (width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
  `<rect width="100%" height="100%" fill="#101418"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#3FD17F" stroke-width="8"/>` +
  `<text x="50%" y="50%" fill="#F2C66D" font-size="${Math.round(Math.min(width, height) / 6)}" text-anchor="middle" dominant-baseline="middle">${width}x${height}</text></svg>`;

const IMAGES = {
  'wide SVG diagram': { path: '/__e2e-media/wide.svg', body: svg(2400, 1050) },
  'tall image': { path: '/__e2e-media/tall.svg', body: svg(600, 2400) },
  'small image': { path: '/__e2e-media/small.svg', body: svg(120, 80) },
} as const;

const imageFixture = (n: number, path: string): ActivityFixture =>
  fixture(n, 'concept', {
    instruction: {
      text: Array.from({ length: 30 }, (_, i) => `Parágrafo ${i + 1} da lição, para a página ter o que rolar.`).join('\n\n'),
      image_url: path,
    },
  });

const IMAGE_FIXTURES = Object.fromEntries(
  Object.entries(IMAGES).map(([name, image], i) => [name, imageFixture(20 + i, image.path)]),
) as Record<keyof typeof IMAGES, ActivityFixture>;

const ALL: ActivityFixture[] = [
  ...SURFACES.map((s) => s.fx),
  CONCEPT,
  DOCUMENT_REFLECTION,
  LIVE_TYPE,
  ...Object.values(IMAGE_FIXTURES),
];

async function open(page: Page, fx: ActivityFixture): Promise<void> {
  await installHarnessSubstrate(page, ALL);
  for (const image of Object.values(IMAGES))
    await page.route(`**${image.path}`, (route) => route.fulfill({ contentType: 'image/svg+xml', body: image.body }));
  await page.goto(harnessUrl(fx));
  await expect(page.getByTestId('activity-test-harness')).toBeVisible();
  await expect(page.locator(`[data-activity-kind="${fx.kind}"]`).first()).toBeVisible();
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);
}

const selection = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '');

const selectionStyle = (target: Locator) =>
  target.evaluate((el) => {
    const style = getComputedStyle(el) as CSSStyleDeclaration & { webkitTouchCallout?: string; webkitUserSelect?: string };
    return {
      userSelect: style.userSelect || style.webkitUserSelect || '',
      touchCallout: style.webkitTouchCallout,
      tapHighlight: style.getPropertyValue('-webkit-tap-highlight-color'),
    };
  });

/** Hold a press for 700 ms, then double-press: the two ways a pointer selects a word. */
async function pressAndHold(page: Page, target: Locator): Promise<{ held: string; doubled: string }> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + Math.min(box.width / 2, 24);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const held = await selection(page);
  await page.mouse.dblclick(x, y);
  const doubled = await selection(page);
  return { held, doubled };
}

/** The stylesheet as shipped: the CSSOM drops a property the engine does not implement. */
async function shippedCss(page: Page): Promise<string> {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => link.href),
  );
  const sheets = await Promise.all(hrefs.map(async (href) => (await page.request.get(href)).text()));
  return sheets.join('\n');
}

test.describe('a held press on an exercise selects nothing', () => {
  for (const { fx, target, gesture } of SURFACES) {
    test(`${fx.kind} — ${gesture}`, async ({ page, browserName }) => {
      await open(page, fx);
      const el = page.locator(target).first();
      await expect(el).toBeVisible();

      const style = await selectionStyle(el);
      expect(style.userSelect).toBe('none');
      // Only WebKit implements the property; Chromium reports `undefined`.
      if (style.touchCallout !== undefined) expect(style.touchCallout).toBe('none');
      if (browserName === 'webkit') expect(style.tapHighlight.replace(/\s/g, '')).toMatch(/^(transparent|rgba\(0,0,0,0\))$/);

      const { held, doubled } = await pressAndHold(page, el);
      expect(held).toBe('');
      expect(doubled).toBe('');
    });
  }

  test('the callout is switched off in the stylesheet the host ships', async ({ page }) => {
    await open(page, ORDER);
    const css = await shippedCss(page);
    expect(css).toMatch(/-webkit-touch-callout:\s*none/);
    expect(css).toMatch(/-webkit-user-select:\s*none/);
    expect(css).toMatch(/-webkit-user-drag:\s*none/);
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*(transparent|#0000)/);
  });

  test('the page still scrolls with a finger on an order card, and the grip keeps the drag', async ({ page }) => {
    await open(page, ORDER);
    const row = page.getByTestId('order-item').first();
    expect(await row.evaluate((el) => getComputedStyle(el).touchAction)).toBe('auto');
    expect(await row.locator('span').first().evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  });
});

test.describe('reading and typing stay selectable', () => {
  test('concept text can be selected', async ({ page, browserName }) => {
    await open(page, CONCEPT);
    const text = page.getByText('Um commit é uma foto do projeto num instante.').first();
    expect((await selectionStyle(text)).userSelect).not.toBe('none');
    const { doubled } = await pressAndHold(page, text);
    // Chromium's touch emulation does not select on a double press; WebKit does.
    if (browserName === 'webkit') expect(doubled.trim()).not.toBe('');
  });

  test('a textarea keeps its caret and its selection', async ({ page }) => {
    await open(page, DOCUMENT_REFLECTION);
    const field = page.locator('textarea').first();
    expect((await selectionStyle(field)).userSelect).not.toBe('none');
    await field.fill('texto do aluno');
    await field.selectText();
    expect(await field.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('texto do aluno');
  });

  test('the live-type input inside a scene keeps typing and selection', async ({ page }) => {
    await open(page, LIVE_TYPE);
    const field = page.getByTestId('live-type-input');
    await expect(field).toBeVisible({ timeout: 20_000 });
    expect((await selectionStyle(field)).userSelect).not.toBe('none');
    await field.fill('Samuel');
    await field.selectText();
    expect(await field.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0))).toBe('Samuel');
  });
});

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
];

const lightbox = (page: Page) => page.getByTestId('instruction-image-zoom');
const scrollTop = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollTop);

async function measure(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => {
      const r = el!.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const frame = document.querySelector('[data-testid="instruction-image-zoom"]')!;
    return {
      // The harness header overflows a 768 px Chromium phone by 19 px, which widens
      // the layout viewport of the page itself; the lightbox can only fill what the page has.
      viewport: {
        width: Math.max(window.visualViewport!.width, window.innerWidth),
        height: Math.max(window.visualViewport!.height, window.innerHeight),
      },
      visible: { width: window.visualViewport!.width, height: window.visualViewport!.height },
      frame: rect(frame),
      image: rect(frame.querySelector('img')),
      close: rect(frame.querySelector('[data-testid="instruction-image-zoom-close"]')),
      backdrop: getComputedStyle(frame).backgroundColor,
      pannable: frame.scrollWidth > frame.clientWidth || frame.scrollHeight > frame.clientHeight,
    };
  });
}

async function openLightbox(page: Page, name: keyof typeof IMAGES, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await open(page, IMAGE_FIXTURES[name]);
  const thumb = page.getByTestId('instruction-image');
  await expect(thumb.locator('img')).toHaveJSProperty('complete', true);
  await thumb.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const before = await scrollTop(page);
  await thumb.click();
  await expect(lightbox(page)).toBeVisible();
  await expect(lightbox(page).locator('img')).toHaveJSProperty('complete', true);
  return before;
}

test.describe('the enlarged lesson image fits the screen', () => {
  for (const viewport of VIEWPORTS) {
    for (const name of Object.keys(IMAGES) as (keyof typeof IMAGES)[]) {
      test(`${name} at ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
        const scrolledTo = await openLightbox(page, name, viewport);
        const m = await measure(page);

        expect(m.image.width).toBeGreaterThan(0);
        expect(m.image.left).toBeGreaterThanOrEqual(0);
        expect(m.image.top).toBeGreaterThanOrEqual(m.close.bottom);
        expect(m.image.right).toBeLessThanOrEqual(m.viewport.width);
        expect(m.image.bottom).toBeLessThanOrEqual(m.viewport.height);
        // Centred between the side paddings.
        expect(Math.abs(m.image.left - (m.viewport.width - m.image.right))).toBeLessThanOrEqual(1);
        expect(m.pannable).toBe(false);

        expect(m.frame).toMatchObject({ left: 0, top: 0 });
        expect(m.frame.width).toBeGreaterThanOrEqual(m.visible.width);
        // WebKit resolves `100dvh` a fraction of a pixel short of the viewport.
        expect(m.frame.height).toBeGreaterThan(m.visible.height - 1);
        expect(m.backdrop.replace(/\s/g, '')).toBe('rgb(0,0,0)');
        expect(m.close.height).toBeGreaterThanOrEqual(44);
        expect(m.close.width).toBeGreaterThanOrEqual(44);

        expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden');
        // Mobile WebKit has no wheel in Playwright; there the lock is the declaration above.
        if (browserName !== 'webkit') {
          await page.mouse.move(viewport.width / 2, viewport.height / 2);
          await page.mouse.wheel(0, 600);
          await page.waitForTimeout(150);
        }
        expect(await scrollTop(page)).toBe(scrolledTo);

        await page.getByTestId('instruction-image-zoom-zoom').click();
        const zoomed = await measure(page);
        expect(zoomed.image.width).toBeCloseTo(m.image.width * 2.5, 0);
        expect(zoomed.pannable).toBe(zoomed.image.width > m.viewport.width || zoomed.image.height > m.viewport.height);
        await lightbox(page).evaluate((el) => el.scrollTo(0, 0));
        const origin = await measure(page);
        expect(origin.image.left).toBeGreaterThanOrEqual(0);
        expect(origin.image.top).toBeGreaterThanOrEqual(0);
        await page.getByTestId('instruction-image-zoom-zoom').click();
        expect((await measure(page)).image.width).toBeCloseTo(m.image.width, 0);

        await page.getByTestId('instruction-image-zoom-close').click();
        await expect(lightbox(page)).toHaveCount(0);
        expect(await scrollTop(page)).toBe(scrolledTo);
        await expect(page.getByTestId('instruction-image')).toBeFocused();
      });
    }
  }

  test('closes on the backdrop and on Escape, restoring the scroll each time', async ({ page }) => {
    const viewport = VIEWPORTS[0];
    const scrolledTo = await openLightbox(page, 'wide SVG diagram', viewport);
    await page.mouse.click(6, viewport.height - 6);
    await expect(lightbox(page)).toHaveCount(0);
    expect(await scrollTop(page)).toBe(scrolledTo);

    await page.getByTestId('instruction-image').click();
    await expect(lightbox(page)).toBeVisible();
    const reopenedAt = await scrollTop(page);
    await page.keyboard.press('Escape');
    await expect(lightbox(page)).toHaveCount(0);
    expect(await scrollTop(page)).toBe(reopenedAt);
  });

  test('the closed page has no lightbox and no scroll lock', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[0]);
    await open(page, IMAGE_FIXTURES['wide SVG diagram']);
    await expect(lightbox(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  });
});

test.describe('the auth forms fit a thumb', () => {
  for (const route of ['/login', '/signup', '/auth/forgot', '/auth/code']) {
    test(`${route}: 44 px controls, 16 px fields, the e-mail keyboard`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 640 });
      await installSupabaseStub(page, []);
      await page.goto(route);
      const email = page.locator('input[type="email"]');
      await expect(email).toBeVisible();
      await expect(email).toHaveAttribute('inputmode', 'email');
      await expect(email).toHaveAttribute('enterkeyhint', /next|send/);

      const controls = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('input, button, a[href]')]
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0)
          .map(({ el, box }) => ({
            name: el.getAttribute('data-testid') ?? el.id ?? el.tagName,
            height: Math.round(box.height),
            field: el.tagName === 'INPUT',
            fontSize: parseFloat(getComputedStyle(el).fontSize),
          })),
      );
      expect(controls.length).toBeGreaterThan(2);
      for (const control of controls) {
        expect(control.height, `${control.name} is ${control.height} px tall`).toBeGreaterThanOrEqual(44);
        if (control.field) expect(control.fontSize, `${control.name} zooms the page on iOS`).toBeGreaterThanOrEqual(16);
      }
    });
  }
});
