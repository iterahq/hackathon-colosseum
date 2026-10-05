/**
 * Responsive assertions — the small, honest set.
 *
 * Running an existing spec at 393px catches nothing unless something asserts
 * layout. These are the assertions that actually hold across the app and that
 * fail loudly when a change breaks phone/tablet:
 *
 *   1. no horizontal overflow (the #1 mobile defect, and self-diagnosing here:
 *      the failure message names the offending elements);
 *   2. the primary affordance is visible AND hit-target sized at the viewport;
 *   3. the sidebar honours its breakpoint contract instead of overlapping the
 *      content — the reference case Tainan named.
 *
 * What they deliberately do NOT catch: typography/scale regressions, anything
 * pixel-perfect, scroll behaviour, and the state matrix. T3 is the rare, coarse
 * tier (plan 20260728-itera-activity-testing) — the state matrix belongs to
 * T0/T1/T2, and pixel regression is out of scope for the whole plan.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Tailwind defaults — the `@theme` of `src/index.css` pins these pixel values. */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/**
 * The GATE is the normative one: **WCAG 2.5.8 Target Size (Minimum), Level AA —
 * 24x24 CSS px**. A test is only allowed to fail on a rule that actually exists.
 *
 * `COMFORTABLE_HIT_TARGET_PX` (44 = Apple HIG 44pt; Material says 48dp) is
 * guidance, not a standard, so falling short of it is RECORDED as an annotation
 * on the test rather than failed. Measured 2026-07-28 against app.iterahq.dev:
 * the live-sidebar controls are `h-11` (44px, comfortable), while the login
 * submit is `h-10` (40px) — AA-conformant, 4px under the comfort guidance. That
 * gap is a design decision for the owner of `@devfellowship/components`, not
 * something this harness gets to unilaterally turn into a red build.
 */
export const MIN_HIT_TARGET_PX = 24;
export const COMFORTABLE_HIT_TARGET_PX = 44;

/** The `lg` branch is where this app's layout flips (`flex-col lg:flex-row`). */
export function isBelowLg(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < BREAKPOINTS.lg;
}

/**
 * The page must not scroll sideways. Tolerance of 1px absorbs sub-pixel
 * rounding; anything larger is a real defect.
 *
 * On failure the message lists up to 5 offending elements with their horizontal
 * extents, so the report is actionable without re-running locally.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string, tolerance = 1) {
  const report = await page.evaluate((tol) => {
    const doc = document.documentElement;
    const inner = window.innerWidth;
    const limit = inner + tol;
    const offenders: string[] = [];
    if (doc.scrollWidth > limit) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= limit && r.left >= -tol) continue;
        const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
        offenders.push(
          `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}> x:[${Math.round(r.left)}..${Math.round(r.right)}]`
        );
        if (offenders.length >= 5) break;
      }
    }
    return { scrollWidth: doc.scrollWidth, inner, offenders };
  }, tolerance);

  expect(
    report.scrollWidth,
    `${label}: the page scrolls horizontally at ${report.inner}px ` +
      `(scrollWidth ${report.scrollWidth}). Offenders: ${report.offenders.join(' | ') || 'none identified'}`
  ).toBeLessThanOrEqual(report.inner + tolerance);
}

/**
 * Visible, and big enough for a thumb: hard-fails below the WCAG AA floor,
 * annotates (never fails) between the AA floor and the 44px comfort guidance.
 */
export async function expectHitTarget(target: Locator, label: string, min = MIN_HIT_TARGET_PX) {
  await expect(target, `${label}: must be visible`).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${label}: has no layout box`).not.toBeNull();
  const h = Math.round(box!.height);
  const w = Math.round(box!.width);
  expect(h, `${label}: hit-target height (WCAG 2.5.8 AA floor ${min}px)`).toBeGreaterThanOrEqual(min);
  expect(w, `${label}: hit-target width (WCAG 2.5.8 AA floor ${min}px)`).toBeGreaterThanOrEqual(min);
  if (h < COMFORTABLE_HIT_TARGET_PX || w < COMFORTABLE_HIT_TARGET_PX) {
    try {
      test.info().annotations.push({
        type: 'hit-target-below-comfort',
        description: `${label}: ${w}x${h}px — conformant with WCAG 2.5.8 AA (${min}px) but under the ${COMFORTABLE_HIT_TARGET_PX}px Apple/Material comfort guidance`,
      });
    } catch {
      /* annotation is reporting only; never load-bearing */
    }
  }
}

/** The element sits inside the viewport horizontally — nothing clipped off-screen. */
export async function expectWithinViewport(target: Locator, label: string, tolerance = 1) {
  const page = target.page();
  const width = page.viewportSize()?.width ?? 0;
  await expect(target, `${label}: must be visible`).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${label}: has no layout box`).not.toBeNull();
  expect(Math.round(box!.x), `${label}: left edge is off-screen`).toBeGreaterThanOrEqual(-tolerance);
  expect(
    Math.round(box!.x + box!.width),
    `${label}: right edge overflows the ${width}px viewport`
  ).toBeLessThanOrEqual(width + tolerance);
}

export interface SidebarContract {
  /** `data-testid` of the `<aside>`. */
  sidebar: string;
  /** `data-testid` of the collapse toggle, when the variant has one (learner). */
  toggle?: string;
  /** Selector for the main region it must not overlap. */
  main?: string;
  /** The rail width at `lg+`, in CSS px. */
  railWidth?: number;
}

/**
 * The live-class sidebar breakpoint contract — the reference for how this app
 * is supposed to behave on phone and tablet.
 *
 * Ground truth, read from the code rather than assumed:
 *   `LiveSessionPage` / `InstructorSessionPage` wrap it in
 *   `flex flex-col lg:flex-row`, and `LiveSidebar` is
 *   `w-full lg:w-[340px] … border-t lg:border-t-0 lg:border-l … lg:sticky`.
 *   Nos dois papéis a lista de alunos é gaveta: um toggle `lg:hidden` e o corpo
 *   `hidden` até alguém tocar.
 *
 * So, below `lg` (phone AND tablet): a full-bleed stacked block with a toggle.
 * At `lg+`: a 340px right rail that starts where the content ends — never on
 * top of it.
 */
export async function expectSidebarBreakpointContract(page: Page, contract: SidebarContract) {
  const width = page.viewportSize()!.width;
  const belowLg = width < BREAKPOINTS.lg;
  const rail = contract.railWidth ?? 340;

  const aside = page.getByTestId(contract.sidebar);
  await expect(aside, `sidebar [${contract.sidebar}] must render`).toBeVisible();
  const main = page.locator(contract.main ?? 'main').first();
  await expect(main, 'the main region must render').toBeVisible();

  const a = await aside.boundingBox();
  const m = await main.boundingBox();
  expect(a, 'sidebar has no layout box').not.toBeNull();
  expect(m, 'main has no layout box').not.toBeNull();

  // The layout width excludes a classic scrollbar; `viewportSize()` does not.
  const contentWidth = await page.evaluate(() => document.documentElement.clientWidth);

  if (belowLg) {
    // Full-bleed, flush left — a stacked block, not a floating overlay.
    expect(Math.round(a!.x), `at ${width}px the sidebar must be flush left (stacked), not a rail`).toBeLessThanOrEqual(1);
    expect(
      Math.round(a!.width),
      `at ${width}px the sidebar must span the content width (got ${Math.round(a!.width)} of ${contentWidth})`
    ).toBeGreaterThanOrEqual(contentWidth - 2);
    // It follows the content instead of covering it.
    expect(
      Math.round(a!.y),
      `at ${width}px the sidebar must sit at or below the top of the content, never over it`
    ).toBeGreaterThanOrEqual(Math.round(m!.y) - 1);
    if (contract.toggle) {
      const toggle = page.getByTestId(contract.toggle);
      await expect(toggle, `below lg the collapse toggle must be offered`).toBeVisible();
      await expect(toggle, 'the sidebar starts collapsed on small screens').toHaveAttribute(
        'aria-expanded',
        'false'
      );
      await expectHitTarget(toggle, 'sidebar collapse toggle');
      await toggle.click();
      await expect(toggle, 'tapping the toggle must expand the sidebar').toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await toggle.click();
    }
  } else {
    expect(Math.round(a!.width), `at ${width}px the sidebar must be the ${rail}px rail`).toBe(rail);
    expect(
      Math.round(a!.x),
      `at ${width}px the rail must start where the content ends — it must not overlap main`
    ).toBeGreaterThanOrEqual(Math.round(m!.x + m!.width) - 2);
    if (contract.toggle) {
      await expect(
        page.getByTestId(contract.toggle),
        'at lg+ the collapse toggle is hidden (the rail is always open)'
      ).toBeHidden();
    }
  }

  await expectNoHorizontalOverflow(page, `live sidebar surface @${width}px`);
}
