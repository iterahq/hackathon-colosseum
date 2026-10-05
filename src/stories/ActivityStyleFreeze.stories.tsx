/**
 * STYLE FREEZE — the measured "before" of the activity shell (Fase 0 of plan
 * `20260827-itera-activities-theming`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE CHANGING ANY NUMBER BELOW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a CHARACTERIZATION suite for PRESENTATION, and it is the sibling of
 * `e2e/activity-baseline.spec.ts` — that one freezes what the activity layer
 * DOES, this one freezes what it LOOKS LIKE. It exists for exactly one reason:
 * the next PR of that plan replaces every hardcoded `rounded-*`, `font-*`,
 * `px-*` and `py-*` in `packages/activities` with an `--ia-*` custom property,
 * and a token swap that changes a corner radius by two pixels is invisible in
 * review, invisible in `npm test`, and invisible in the e2e baseline. Nothing
 * in this repo would go red for it.
 *
 * **Corollary, and it is binding: every constant in `FROZEN` is a MEASUREMENT,
 * not a preference.** Each was read out of a real browser on the unmodified
 * tree, and each is annotated with the Tailwind literal it came from. If a
 * number here becomes wrong, the styling MOVED — that is the finding, and the
 * fix is the product, not this file. Editing a constant to make the suite green
 * destroys the only property it has.
 *
 * There is one legitimate reason to edit a constant: a DELIBERATE restyle,
 * landed in the same PR that changes the literal, with the new value measured
 * the same way. Say so in that PR.
 *
 * ── WHY A STORY, AND WHY THE BROWSER TIER ──────────────────────────────────
 * jsdom has no layout engine and no cascade: `getComputedStyle(el).borderRadius`
 * there answers with whatever was set inline, which for a Tailwind class is the
 * empty string. A suite written against jsdom would freeze nothing and pass
 * forever. So this carries the `browser-mode` tag from ADR-8 of plan
 * `20260728-itera-activity-testing` and runs under `vitest.browser.config.ts`
 * (`npm run test:browser`), where Chromium resolves the real cascade — the same
 * cascade the learner gets, because `.storybook/preview.tsx` imports
 * `src/index.css` and mounts the app's own `dark` shell.
 *
 * ⚠️ It is the THIRD file allowed to carry that tag, and the first that is not
 * an activity kind. `src/test/storyPlay.test.tsx` holds the allowlist and had to
 * be widened for it; the reason is written there.
 *
 * ── WHAT IT MEASURES, AND WHY THOSE EIGHT ──────────────────────────────────
 * Eight STYLE ROLES, not eight class names. A role is the thing a token will
 * stand for after PR 2, so the role is what has to survive the rename:
 *
 *   1. `shellRadius`   — the activity card's corner        (`rounded-3xl`)
 *   2. `controlRadius` — an input the learner types into   (`rounded-2xl`)
 *   3. `pillRadius`    — badge + button, fully round       (`rounded-full`)
 *   4. `displayFont`   — headings                          (`font-display`)
 *   5. `bodyFont`      — inherited prose                   (`body`, index.css)
 *   6. `monoFont`      — the kind eyebrow, code            (`font-mono`)
 *   7. `shellPadding`  — the card's own inset              (`px-6 md:px-8` …)
 *   8. `shellRhythm`   — the vertical gaps inside the card (`mt-5`, `mt-6` …)
 *
 * Colour is deliberately ABSENT, and that absence is a measured claim rather
 * than an oversight: the components already speak in semantic Tailwind tokens
 * (`bg-card`, `border-border`, `text-muted-foreground`, the `evergreen`/`clay`
 * family), so a host that owns the Tailwind build already re-colours them.
 * Freezing a colour here would freeze the STORYBOOK theme, not the package —
 * and would go red for a host that legitimately re-themed.
 *
 * ── THE ONE THING THAT IS NOT A CONSTANT ───────────────────────────────────
 * `px-6 md:px-8` is two values with a breakpoint between them, and the browser
 * tier does not pin its viewport. So the EXPECTATION is selected at runtime by
 * the same media query the utility uses, and both arms are frozen. What the
 * suite asserts is therefore the whole rule — 24 px below 768 px, 32 px at and
 * above it — rather than whichever arm today's window happens to land in.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { BookOpen } from 'lucide-react';
import {
  ActivityShell,
  ActivityTextarea,
  DoneButton,
  RichText,
} from '@iterahq/activities';
import { withActivityWidth } from './decorators';

/* ══════════════════════════════════════════════════════════════════════════
 * THE FREEZE
 *
 * Measured in Chromium on 2026-08-27, against the tree at the commit that
 * introduced this file. Every entry names the literal it came from, so a reader
 * can check the number against the source without running anything.
 * ══════════════════════════════════════════════════════════════════════════ */
const FROZEN = {
  /** `ActivityShell` → `rounded-3xl`. The activity card. */
  shellRadius: '24px',
  /** `ActivityTextarea` variant `boxed` → `rounded-2xl`. Every typed control. */
  controlRadius: '16px',
  /** `KindBadge` and `DoneButton` → `rounded-full`. Chromium clamps to 9999px. */
  pillRadius: '9999px',

  /**
   * `font-display`, as it RESOLVES — which is not what the Tailwind 3 theme
   * said.
   *
   * 🔎 MEASURED FINDING, and it is the reason a freeze is worth writing.
   * `tailwind.config.ts` declared `display: ['Barlow Condensed', 'system-ui',
   * 'sans-serif']`, but `src/index.css` re-declares `.font-display` inside
   * `@layer utilities` with `'Barlow Condensed', sans-serif` plus a
   * `letter-spacing`. Same layer, later rule, so the APP's CSS wins and
   * `system-ui` never reaches the cascade.
   *
   * That matters past this file: the package carries `font-display` as a string
   * literal, so which stack a host gets depends on CSS the host owns. The
   * frozen value is the resolved one, because the resolved one is what the
   * learner sees.
   */
  displayFont: '"Barlow Condensed", sans-serif',
  /**
   * Inherited from `body`, which `src/index.css` sets to `'Inter', sans-serif`
   * — again the app's CSS, not `fontFamily.sans`. No activity component names a
   * body font at all.
   */
  bodyFont: 'Inter, sans-serif',
  /**
   * `font-mono` → `--font-mono` in the `@theme` of `src/index.css`. This one is NOT
   * shadowed: the brand-utilities block of `src/index.css` re-declares the
   * display and body families and adds a "meta" one, but leaves the monospace
   * utility to Tailwind.
   *
   * ⚠️ The two shadowed names are described rather than spelled here ON
   * PURPOSE. Tailwind's content scanner reads this file as text, comments
   * included, and nothing in the app uses those two classes — so writing them
   * out resurrected two purged rules into every user's stylesheet. Measured:
   * two rules, ~150 bytes, dead on arrival. A comment is not supposed to emit
   * CSS.
   */
  monoFont: '"JetBrains Mono", ui-monospace, monospace',

  /** `ActivityShell` → `px-6 md:px-8`. Both arms, and the breakpoint. */
  shellPaddingX: { base: '24px', md: '32px' },
  /** `ActivityShell`, non-compact → `py-6 md:py-8`. */
  shellPaddingY: { base: '24px', md: '32px' },
  /**
   * `ActivityShell`, compact → `py-4 md:py-5`.
   *
   * The compact arm is frozen too, and on purpose: `COMPACT_KINDS` exists
   * because splitting the old single sandbox kind into `chat_sandbox` +
   * `terminal_sandbox` would otherwise have loosened the padding on every
   * migrated row. That component's own comment calls it "a layout regression
   * with no failing test to catch it". This is that test.
   */
  compactPaddingY: { base: '16px', md: '20px' },

  /** `ActivityShell` → `mt-5` between the kind badge and the content. */
  shellInnerGap: '20px',
  /** `ActivityShell`, compact → `mt-3`. Same reason as `compactPaddingY`. */
  compactInnerGap: '12px',
  /** `DoneButton` → `mt-6`. The gap above the completion affordance. */
  controlGap: '24px',
  /** `DoneButton` → `h-12`. A pill with the wrong height is not the same pill. */
  controlHeight: '48px',
} as const;

/** The breakpoint `md:` compiles to. Frozen because the arms are frozen. */
const MD_QUERY = '(min-width: 768px)';

/** Which arm of a `base` / `md` pair applies in the window the test got. */
function forViewport(pair: { base: string; md: string }): string {
  return window.matchMedia(MD_QUERY).matches ? pair.md : pair.base;
}

/**
 * Read ONE computed property. Longhand, never the `borderRadius` /
 * `padding` shorthands: Chromium collapses those when the four sides agree and
 * spells them out when they do not, so a shorthand assertion would silently
 * change shape the day someone gives a corner its own value.
 */
function computed(el: Element, prop: string): string {
  return window.getComputedStyle(el).getPropertyValue(prop);
}

/** All four corners of a box, so "round" cannot decay into "round on top". */
function corners(el: Element): string[] {
  return [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ].map((p) => computed(el, p));
}

/* ══════════════════════════════════════════════════════════════════════════
 * THE SPECIMEN
 *
 * One non-compact shell carrying the three things a graded kind puts inside it
 * (a heading, a control, the done affordance), plus one compact shell — because
 * `COMPACT_KINDS` is a second set of literals and freezing only the loose arm
 * would leave the sandboxes uncovered.
 *
 * It is NOT a kind. Mounting a real kind would drag its spec, its answer machine
 * and its i18n into a suite about pixels, and every one of those is a way for
 * this file to go red for a reason that has nothing to do with styling.
 * ══════════════════════════════════════════════════════════════════════════ */
function StyleFreezeSpecimen() {
  return (
    <div className="space-y-6">
      <ActivityShell kind="concept" icon={BookOpen} label="Conceito">
        <RichText text={'## Um título\n\nUm parágrafo de corpo.'} data-testid="freeze-prose" />
        <ActivityTextarea
          value=""
          onChange={() => {}}
          rows={3}
          data-testid="freeze-textarea"
          aria-label="freeze"
        />
        <DoneButton onClick={() => {}} />
      </ActivityShell>

      <ActivityShell kind="chat_sandbox" icon={BookOpen} label="Sandbox">
        <div data-testid="freeze-compact-content">conteúdo</div>
      </ActivityShell>
    </div>
  );
}

const meta: Meta<typeof StyleFreezeSpecimen> = {
  title: 'Organisms/Activities/9 · Partes compartilhadas/Congelamento de estilo',
  id: 'activities-partes-congelamento-de-estilo',
  component: StyleFreezeSpecimen,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof StyleFreezeSpecimen>;

/**
 * The specimen on its own — no assertions, so the shapes this suite pins stay
 * visible in the published Storybook. A frozen value nobody can look at is a
 * number in a test file; this is the picture it describes.
 */
export const Especimen: Story = {};

/**
 * THE FREEZE. Eight roles, asserted against the computed cascade.
 *
 * `browser-mode` is what routes it away from jsdom — see the file header for
 * why running it there would be worse than not running it at all.
 */
export const CongelamentoDeEstilo: Story = {
  tags: ['browser-mode'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const shell = canvasElement.querySelector<HTMLElement>(
      '[data-testid="activity-shell"][data-activity-kind="concept"]',
    );
    const compactShell = canvasElement.querySelector<HTMLElement>(
      '[data-testid="activity-shell"][data-activity-kind="chat_sandbox"]',
    );
    await expect(shell).not.toBeNull();
    await expect(compactShell).not.toBeNull();

    /* ─── 1. shell radius ─────────────────────────────────────────────────
     * The card the whole activity lives inside. `rounded-3xl`. */
    await expect(corners(shell!)).toEqual(Array(4).fill(FROZEN.shellRadius));

    /* ─── 2. control radius ───────────────────────────────────────────────
     * The typed control. `rounded-2xl`, and deliberately NOT the same value as
     * the shell — a token pass that collapses the two would be a restyle. */
    const textarea = canvas.getByTestId('freeze-textarea');
    await expect(corners(textarea)).toEqual(Array(4).fill(FROZEN.controlRadius));
    await expect(FROZEN.controlRadius).not.toBe(FROZEN.shellRadius);

    /* ─── 3. pill radius ──────────────────────────────────────────────────
     * The kind eyebrow and the done button. `rounded-full` on both — one
     * literal, two consumers, so the assertion names both. The badge is the
     * shell's FIRST child by construction (`ActivityShell` renders `<KindBadge>`
     * and then the content wrapper); it carries no testid of its own, and
     * adding one would be a product edit inside a freeze commit. */
    const badge = shell!.firstElementChild!;
    const done = canvas.getByTestId('activity-done');
    await expect(corners(badge)).toEqual(Array(4).fill(FROZEN.pillRadius));
    await expect(corners(done)).toEqual(Array(4).fill(FROZEN.pillRadius));

    /* ─── 4. display font ─────────────────────────────────────────────────
     * Headings, via `RichBlock`'s `font-display`. */
    const heading = canvasElement.querySelector('[data-rich-block="heading"]')!;
    await expect(heading).not.toBeNull();
    await expect(computed(heading, 'font-family')).toBe(FROZEN.displayFont);

    /* ─── 5. body font ────────────────────────────────────────────────────
     * INHERITED, not declared: no activity component names a body font, so what
     * is frozen here is that the shell keeps inheriting the host's. A PR that
     * gives the package its own body stack changes what a host controls, and
     * that is precisely the kind of change this line exists to surface. */
    await expect(computed(shell!, 'font-family')).toBe(FROZEN.bodyFont);

    /* ─── 6. mono font ────────────────────────────────────────────────────
     * The kind eyebrow. 42 sites in the package share this one literal. */
    await expect(computed(badge, 'font-family')).toBe(FROZEN.monoFont);

    /* ─── 7. shell padding ────────────────────────────────────────────────
     * Both arms of `px-6 md:px-8` / `py-6 md:py-8`, and the compact `py-4
     * md:py-5`. The arm is chosen by the same media query the utility uses —
     * see the header. */
    const padX = forViewport(FROZEN.shellPaddingX);
    await expect(computed(shell!, 'padding-left')).toBe(padX);
    await expect(computed(shell!, 'padding-right')).toBe(padX);
    await expect(computed(shell!, 'padding-top')).toBe(forViewport(FROZEN.shellPaddingY));
    await expect(computed(shell!, 'padding-bottom')).toBe(forViewport(FROZEN.shellPaddingY));

    // The compact kinds keep the SAME horizontal inset and a tighter vertical
    // one. Freezing both halves is what makes "compact" a measurable claim.
    await expect(computed(compactShell!, 'padding-left')).toBe(padX);
    await expect(computed(compactShell!, 'padding-top')).toBe(
      forViewport(FROZEN.compactPaddingY),
    );

    /* ─── 8. vertical rhythm ──────────────────────────────────────────────
     * The gaps INSIDE the card: badge → content, and content → done button.
     * `mt-5` / `mt-3` / `mt-6`, plus the button's own `h-12`, because a pill
     * that keeps its radius and loses its height is not the same pill. */
    const content = shell!.children[1];
    const compactContent = compactShell!.children[1];
    await expect(computed(content, 'margin-top')).toBe(FROZEN.shellInnerGap);
    await expect(computed(compactContent, 'margin-top')).toBe(FROZEN.compactInnerGap);
    await expect(computed(done, 'margin-top')).toBe(FROZEN.controlGap);
    await expect(computed(done, 'height')).toBe(FROZEN.controlHeight);
  },
};
