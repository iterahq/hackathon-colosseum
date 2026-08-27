/**
 * THE `theme` PORT REACHES THE DOM — plan `20260827-itera-activities-theming`,
 * Fase 1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS EXISTS TO STOP HAPPENING AGAIN
 * ─────────────────────────────────────────────────────────────────────────────
 * `ActivityTheme` was declared in `packages/activities/src/ports.ts` and
 * documented in `CONTRACT.md` from Fase A onwards. `<ActivityProvider>` even
 * memoised `host.theme` into the context value, with `theme` in the dependency
 * list. And NOTHING READ IT: `theme.tokens`, `theme.className` and
 * `theme.appearance` reached no DOM node anywhere in the package. A host that
 * passed `theme={{ tokens: { … } }}` got silence — not an error, not a warning,
 * not a changed pixel, and no failing test.
 *
 * A declared-and-dead port is worse than an absent one, because the absent one
 * does not compile. This file is the reader's receipt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE NEGATIVE CONTROL IS NOT OPTIONAL
 * ─────────────────────────────────────────────────────────────────────────────
 * The three positive assertions below all pass against a component that applies
 * the theme AND against one that applies it plus half the stylesheet. They do
 * not pass against a component that applies nothing — but neither does anything
 * else, and that is the point of the fourth test: with no `theme` prop, the
 * class must be ABSENT, no custom property may be set, and no `data-appearance`
 * attribute may exist. Without it, "the port is wired" would be a claim this
 * suite cannot distinguish from "the port is wired to something that was always
 * there".
 *
 * The control also pins the compatibility guarantee that made this change safe
 * to ship: an unthemed render produces NO extra element at all, so every host
 * on `main` today keeps byte-identical DOM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT THE STORY-ONLY SEAM ADR-4 FORBIDS
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan `20260728-itera-activity-testing`, ADR-4: *a state reachable by a prop
 * but not by a real user is a false green.* The rule is intact here, and the
 * reason is structural: `theme` is not a learner-facing state descriptor. It is
 * a HOST API — the documented way an app that installs `@iterahq/activities`
 * configures presentation — and the host IS the real user of a library. There
 * is no interaction that could reach it, in the same way there is no click that
 * reaches `i18n` or `storage`, both of which are proven exactly like this.
 *
 * The learner-facing half of theming is the RENDERED RESULT, and that is
 * measured in a real browser by
 * `src/stories/ActivityStyleFreeze.stories.tsx` — the freeze suite that says
 * the eight style roles have not moved.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityProvider, ActivityRenderer, createActivityI18n } from '@iterahq/activities';
import type { ActivityTheme } from '@iterahq/activities';
import type { PortableActivity } from '@iterahq/activities';
import { CONCEPT_SPEC } from '@/stories/contractFixtures';

const ACTIVITY: PortableActivity = {
  id: 'theme-port-fixture',
  kind: 'concept',
  spec: CONCEPT_SPEC,
  rubric: null,
};

/**
 * Mount one activity under a host context, with or without a theme.
 *
 * `concept` on purpose: it is the simplest built-in, it needs no port beyond
 * i18n, and it grades nothing — so a failure here is about the theme and can be
 * about nothing else.
 */
function mount(theme?: ActivityTheme) {
  return render(
    <ActivityProvider i18n={createActivityI18n('pt')} theme={theme}>
      <ActivityRenderer activity={ACTIVITY} onComplete={() => {}} />
    </ActivityProvider>,
  );
}

/** The activity root the renderer marks when — and only when — a theme is live. */
function themeRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-activity-theme="true"]');
}

describe('the `theme` port reaches the activity root', () => {
  it('`className` lands on the root', () => {
    const { container } = mount({ className: 'acme-activities' });
    const root = themeRoot(container);
    expect(root).not.toBeNull();
    expect(root!.classList.contains('acme-activities')).toBe(true);
    // The activity itself is INSIDE it — a class on a sibling would scope nothing.
    expect(root!.contains(screen.getByTestId('activity-shell'))).toBe(true);
  });

  it('`tokens` become inline CSS custom properties on that same root', () => {
    const { container } = mount({
      tokens: { '--ia-radius-shell': '2rem', '--ia-font-display': 'Georgia' },
    });
    const root = themeRoot(container)!;
    expect(root.style.getPropertyValue('--ia-radius-shell')).toBe('2rem');
    expect(root.style.getPropertyValue('--ia-font-display')).toBe('Georgia');
  });

  /**
   * A key written WITHOUT the leading `--` still becomes a custom property.
   *
   * React reads a `style` key with no `--` as a CSS property name and drops an
   * unknown one without a word — i.e. the naive pass-through would reproduce,
   * inside the fix, the very silent no-op the fix is for.
   */
  it('a token key without the `--` prefix is still set as a custom property', () => {
    const { container } = mount({ tokens: { 'ia-radius-control': '4px' } });
    expect(themeRoot(container)!.style.getPropertyValue('--ia-radius-control')).toBe('4px');
  });

  it('`appearance` writes `data-appearance`, and `dark` also adds the class', () => {
    const { container, unmount } = mount({ appearance: 'dark' });
    const dark = themeRoot(container)!;
    expect(dark.getAttribute('data-appearance')).toBe('dark');
    expect(dark.classList.contains('dark')).toBe(true);
    unmount();

    // `'light'` sets the attribute and adds NO class. Tailwind's class strategy
    // is additive: a package can add `dark` to a subtree, it cannot remove one
    // an ancestor put on `<html>`. Asserting the absence is what keeps the
    // documented limit from quietly becoming a promise.
    const light = mount({ appearance: 'light' });
    const lightRoot = themeRoot(light.container)!;
    expect(lightRoot.getAttribute('data-appearance')).toBe('light');
    expect(lightRoot.classList.contains('dark')).toBe(false);
  });

  it('all three travel together on ONE element', () => {
    const { container } = mount({
      className: 'acme-activities',
      appearance: 'dark',
      tokens: { '--ia-radius-shell': '2rem' },
    });
    const roots = container.querySelectorAll('[data-activity-theme="true"]');
    expect(roots).toHaveLength(1);
    const root = roots[0] as HTMLElement;
    expect(root.classList.contains('acme-activities')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.getAttribute('data-appearance')).toBe('dark');
    expect(root.style.getPropertyValue('--ia-radius-shell')).toBe('2rem');
  });

  /* ═════════════════════════════════════════════════════════════════════════
   * NEGATIVE CONTROL — see the header. Without this, the five tests above pass
   * on a component that applies nothing.
   * ═════════════════════════════════════════════════════════════════════════ */
  describe('negative control — no `theme` prop', () => {
    it('renders NO theme root at all, so no host on main sees a DOM change', () => {
      const { container } = mount(undefined);
      expect(themeRoot(container)).toBeNull();
      expect(container.querySelector('[data-activity-theme]')).toBeNull();
      // The activity still rendered — the control must not pass by rendering
      // nothing, which would satisfy every absence assertion below for free.
      expect(screen.getByTestId('activity-shell')).toBeInTheDocument();
    });

    it('sets no custom property and no `data-appearance` anywhere in the tree', () => {
      const { container } = mount(undefined);
      expect(container.querySelector('[data-appearance]')).toBeNull();
      const withInlineCustomProp = [...container.querySelectorAll<HTMLElement>('*')].filter((el) =>
        Array.from(el.style).some((prop) => prop.startsWith('--')),
      );
      expect(withInlineCustomProp).toEqual([]);
    });

    it('an EMPTY theme object is also inert — a host asking for nothing gets nothing', () => {
      expect(themeRoot(mount({}).container)).toBeNull();
      expect(themeRoot(mount({ tokens: {} }).container)).toBeNull();
    });
  });
});
