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
import { installHarnessSubstrate, installSupabaseStub, harnessUrl, STUB_SUPABASE_URL } from './support/harnessStub';
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

  test('a finger anywhere on an order card drags it, not only on the grip', async ({ page }) => {
    await open(page, ORDER);
    const rows = page.getByTestId('order-item');
    expect(await rows.first().evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');

    const firstId = await rows.nth(0).getAttribute('data-option-id');
    const from = await rows.nth(0).boundingBox();
    const to = await rows.nth(1).boundingBox();
    if (!from || !to) throw new Error('order: a row has no box');
    // Right of the grip and the position badge: the label.
    const x = from.x + from.width * 0.6;
    const startY = from.y + from.height / 2;
    const endY = to.y + to.height / 2 + 4;
    const touch = (type: 'pointerdown' | 'pointermove' | 'pointerup', y: number) =>
      page.evaluate(
        ({ type, x, y }) => {
          const target = type === 'pointerdown' ? document.elementFromPoint(x, y)! : window;
          target.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x,
              clientY: y,
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1,
            }),
          );
        },
        { type, x, y },
      );
    await touch('pointerdown', startY);
    for (let i = 1; i <= 8; i++) {
      await touch('pointermove', startY + ((endY - startY) * i) / 8);
      await page.waitForTimeout(30);
    }
    await touch('pointerup', endY);

    await expect(rows.nth(1)).toHaveAttribute('data-option-id', firstId!);
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

  test('two fingers enlarge the image and bring it back, with the page viewport locked like in the app', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the two-finger gesture is driven through CDP');
    const viewport = VIEWPORTS[0];
    await openLightbox(page, 'wide SVG diagram', viewport);
    // What the native shell does to the page: the browser's own pinch is off.
    await page.evaluate(() =>
      document.querySelector('meta[name="viewport"]')!.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no'),
    );
    const fitted = await measure(page);
    const cx = fitted.image.left + fitted.image.width / 2;
    const cy = fitted.image.top + fitted.image.height / 2;

    const cdp = await page.context().newCDPSession(page);
    const fingers = (type: 'touchStart' | 'touchMove' | 'touchEnd', half?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: half === undefined ? [] : [{ x: cx - half, y: cy, id: 0 }, { x: cx + half, y: cy, id: 1 }],
      });
    const pinch = async (from: number, to: number) => {
      await fingers('touchStart', from);
      for (let i = 1; i <= 8; i++) await fingers('touchMove', from + ((to - from) * i) / 8);
      await fingers('touchEnd');
    };

    await pinch(30, 90);
    await expect(lightbox(page)).toHaveAttribute('data-zoomed', 'true');
    const enlarged = await measure(page);
    expect(enlarged.image.width).toBeCloseTo(fitted.image.width * 3, 0);
    expect(enlarged.pannable).toBe(true);
    // The point between the fingers stays under them.
    expect(Math.abs(enlarged.image.left + enlarged.image.width / 2 - cx)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    await expect(lightbox(page)).toBeVisible();

    await pinch(120, 20);
    await expect(lightbox(page)).toHaveAttribute('data-zoomed', 'false');
    expect((await measure(page)).image.width).toBeCloseTo(fitted.image.width, 0);
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

const uuid = (unit: number, lesson: number, activity = 0) =>
  `00000000-0000-4000-9${String(unit).padStart(3, '0')}-${String(lesson).padStart(6, '0')}${String(activity).padStart(6, '0')}`;

/** Two weeks of three lessons, nothing done: each week opens at its first lesson. */
async function openProgram(page: Page, progress: { activity_id: string; status: string }[] = []): Promise<void> {
  const units = [1, 2].map((u) => ({
    id: uuid(u, 0),
    program_id: uuid(0, 1),
    ordinal: u,
    title_i18n: { pt: `Semana ${u}` },
    lessons: [1, 2, 3].map((l) => ({
      id: uuid(u, l),
      unit_id: uuid(u, 0),
      ordinal: l,
      title_i18n: { pt: `Lição ${u}.${l}` },
      activities: [{ id: uuid(u, l, 1), lesson_id: uuid(u, l), ordinal: 0, kind: 'concept', spec: {}, rubric: {}, artifact_policy: {} }],
    })),
  }));
  const program = {
    id: uuid(0, 1),
    tenant_id: '00000000-0000-4000-8000-000000000003',
    slug: 'html-do-zero',
    title_i18n: { pt: 'HTML do zero' },
    created_at: '2026-01-01T00:00:00Z',
    units,
  };
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
  await installHarnessSubstrate(page, []);
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/programs*`, (route) => route.fulfill(json(program)));
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/progress*`, (route) => route.fulfill(json(progress)));
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/my_subscription*`, (route) =>
    route.fulfill(json([{ status: 'active', is_active: true, current_period_end: null, seat_count: 1, cancel_at_period_end: false }])),
  );
  await page.goto('/program/html-do-zero');
  await expect(page.getByTestId('skill-tree')).toBeVisible();
}

test.describe('the program page under a finger', () => {
  test('a locked lesson answers a tap with what it waits for, and opens nothing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProgram(page);
    const nodes = page.locator('[data-testid^="tree-node-"]');
    await expect(nodes.nth(0)).toHaveAttribute('data-testid', 'tree-node-current');
    await expect(nodes.nth(2)).toHaveAttribute('data-testid', 'tree-node-locked');

    await nodes.nth(1).tap({ force: true });
    const hint = page.getByTestId('tree-lock-hint');
    await expect(hint).toHaveText(/Conclua o Dia 1 para liberar/);
    await expect(page.getByRole('status')).toHaveText('Conclua o Dia 1 para liberar');
    expect(new URL(page.url()).pathname).toBe('/program/html-do-zero');
    const [box, view] = [(await hint.boundingBox())!, page.viewportSize()!];
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);

    await page.touchscreen.tap(4, 520);
    await expect(hint).toHaveCount(0);
  });

  test('a lesson finished with a miss says what is left, and the next one says why it is locked', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Lesson 1.1 has one activity, answered and missed: the learner reached its end.
    await openProgram(page, [{ activity_id: uuid(1, 1, 1), status: 'in_progress' }]);
    const nodes = page.locator('[data-testid^="tree-node-"]');
    await expect(nodes.nth(0)).toHaveAttribute('data-testid', 'tree-node-current');
    await expect(nodes.nth(1)).toHaveAttribute('data-testid', 'tree-node-locked');

    const callout = page.getByTestId('tree-callout');
    await expect(page.getByTestId('tree-callout-note')).toHaveText(/Falta acertar 1 tela/);
    await expect(callout.getByRole('button')).toHaveText('Refazer o que faltou');
    // The taller callout does not sit on the next lesson.
    const [box, next] = [(await callout.boundingBox())!, (await nodes.nth(1).boundingBox())!];
    expect(box.y + box.height).toBeLessThanOrEqual(next.y);

    await nodes.nth(1).tap({ force: true });
    await expect(page.getByTestId('tree-lock-hint')).toHaveText(/Acerte o que faltou no Dia 1 para liberar/);
  });

  test('the app header controls have a 44 px hit area', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProgram(page);
    for (const id of ['locale-toggle-mobile', 'user-menu-trigger']) {
      const hit = await page.getByTestId(id).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const reaches = (y: number) => document.elementFromPoint(x, y)?.closest('[data-testid]') === el;
        let top = box.top;
        while (reaches(top - 1)) top -= 1;
        let bottom = box.bottom;
        while (reaches(bottom + 1)) bottom += 1;
        return bottom - top;
      });
      expect(hit, `${id} reaches ${hit} px`).toBeGreaterThanOrEqual(43);
    }
  });
});
