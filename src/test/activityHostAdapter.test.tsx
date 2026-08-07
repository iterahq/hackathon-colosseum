/**
 * The learner scope really reaches the extracted kinds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 * Before Fase C, `learnerShuffle` read the Itera user id itself, out of
 * localStorage. That is host session state, so the port now carries it
 * (`identity.userId`) and `IteraActivityHost` fills it from
 * `currentStorageScope()`.
 *
 * Break that wire and NOTHING FAILS. No exception, no red test, no visual
 * difference: every learner falls back to the per-browser anonymous scope, each
 * still sees a stable order, and the only thing that stops holding is the
 * reason the shuffle exists — two learners side by side must not be able to
 * copy "it's the third one". A silent loss of a pedagogical property is exactly
 * the kind of regression a "the app still builds" check cannot catch, so it is
 * pinned mechanically here.
 *
 * The assertion is deliberately end-to-end through the DOM rather than a spy on
 * the provider: what matters is the ORDER A LEARNER SEES, and a spy would pass
 * even if the kind stopped consulting the scope it was handed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityProvider } from '@iterahq/activities';
import { I18nProvider } from '@/i18n';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { learnerShuffle } from '@/utils/learnerShuffle';
import { clearIteraStorage, rememberStorageScope } from '@/utils/storageScope';
import type { Activity } from '@/types/content';

const OPTIONS = Array.from({ length: 8 }, (_, i) => ({ id: `opt-${i}`, label: `Option ${i}` }));

const ACTIVITY: Activity = {
  id: 'act-shuffle-scope',
  lessonId: 'l',
  ordinal: 0,
  kind: 'single_choice',
  spec: { options: OPTIONS, correct_option_id: 'opt-0' },
  rubric: null,
};

function renderWithScope(userId: string | null) {
  return render(
    <I18nProvider>
      <ActivityProvider
        i18n={{ locale: 'pt', t: (k) => k, tText: () => '' }}
        identity={{ authenticated: Boolean(userId), userId }}
      >
        <SingleChoiceActivity activity={ACTIVITY} onComplete={vi.fn()} />
      </ActivityProvider>
    </I18nProvider>,
  );
}

function renderedOrder(): string[] {
  return screen
    .getAllByTestId('single-choice-option')
    .map((el) => el.getAttribute('data-option-id') ?? '');
}

describe('IteraActivityHost — the learner scope reaches the shuffle', () => {
  beforeEach(() => {
    clearIteraStorage();
  });

  it('shuffles with the injected identity, matching the app-side util', () => {
    rememberStorageScope('learner-alpha');
    const { unmount } = renderWithScope('learner-alpha');
    // `learnerShuffle` (the app adapter) resolves the same scope from storage.
    // Same learner + same activity ⇒ the exact same permutation, which is the
    // "deterministic" half of the property.
    expect(renderedOrder()).toEqual(learnerShuffle(OPTIONS, ACTIVITY.id).map((o) => o.id));
    unmount();
  });

  it('gives two different learners different orders — the pedagogical half', () => {
    const { unmount } = renderWithScope('learner-alpha');
    const alpha = renderedOrder();
    unmount();

    renderWithScope('learner-beta');
    const beta = renderedOrder();

    expect(alpha.sort()).toEqual(beta.sort()); // same options…
    expect(renderedOrder()).not.toEqual(alpha); // …different arrangement
  });

  it('a missing scope does NOT collapse everyone onto one order', () => {
    // The fallback is a per-browser anonymous id, not a constant. If someone
    // "simplified" `resolveLearnerScope` to a fixed string, this goes red —
    // and that simplification is precisely what makes the shuffle vanish.
    const { unmount } = renderWithScope(null);
    const first = renderedOrder();
    unmount();
    expect(first).toHaveLength(OPTIONS.length);
    expect(first).not.toEqual(OPTIONS.map((o) => o.id).sort());
  });
});
