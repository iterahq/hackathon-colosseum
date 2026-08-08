/**
 * The `document` kind picks its renderer off a CAPABILITY, and Fase D changed
 * how that capability is asked. This file pins the answer on both sides.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST DID NOT EXIST BEFORE, AND WHY IT HAS TO NOW
 * ─────────────────────────────────────────────────────────────────────────────
 * Before the extraction, the branch read:
 *
 *     rubric.mode === 'ai-judge' && iteraApiConfigured()
 *
 * `iteraApiConfigured()` reads `import.meta.env.VITE_ITERA_API_BASE`. It was
 * effectively untestable — a module-level env read, decided at build time — and
 * so it was untested. It also could not travel: compiled into
 * `@iterahq/activities`, it would report on the machine that BUILT the package
 * and answer `false` for every consumer, forever.
 *
 * It is now `Boolean(api?.judge)`, asked of the host at runtime. That is a
 * strictly better design AND a new way to be wrong: hand the package an `api`
 * object unconditionally and every unconfigured deploy starts showing learners
 * a judge screen backed by nothing. `IteraActivityHost` therefore withholds the
 * whole object when the base URL is unset — a one-line decision whose failure
 * mode is silent and learner-facing, which is the definition of a thing that
 * needs a test.
 *
 * ⚠️ NOTE WHAT THE ABSENT PORT PRODUCES: not an error card, not a placeholder,
 * but the REFLECTION renderer — a real, usable activity with a textarea. That
 * is ADR-3's "degrade explicitly" in its most concrete form, and it is also
 * exactly what the app did before, with the API unconfigured. Asserting the
 * textarea is present (rather than merely asserting the judge button is absent)
 * is what makes this a test of the degradation instead of a test of an absence.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityProvider } from '@iterahq/activities';
import type { ActivityApiPort } from '@iterahq/activities';
import type { ReactNode } from 'react';
import { I18nProvider, useI18n } from '@/i18n';
import { DocumentActivity } from '@/components/branded/activity/DocumentActivity';
import type { Activity } from '@/types/content';

const AI_JUDGE_DOC = {
  id: 'doc-judge-1',
  kind: 'document',
  spec: { prompt: 'Escreva seu data-spec.md', body: 'Contexto' },
  rubric: { mode: 'ai-judge' },
  status: 'todo',
} as unknown as Activity;

/**
 * A provider that injects the ports, using the app's own `useI18n()` — the same
 * bridge `IteraActivityHost` builds, minus the auth/session reads a test tree
 * has no way to satisfy.
 */
function Host({ api, children }: { api?: ActivityApiPort; children: ReactNode }) {
  const i18n = useI18n();
  return (
    <ActivityProvider i18n={i18n} api={api} identity={{ authenticated: true }}>
      {children}
    </ActivityProvider>
  );
}

function mount(api?: ActivityApiPort) {
  return render(
    <I18nProvider>
      <Host api={api}>
        <DocumentActivity activity={AI_JUDGE_DOC} onComplete={() => {}} />
      </Host>
    </I18nProvider>
  );
}

describe('an `ai-judge` document asks the HOST, not the build', () => {
  it('renders the judge surface when the host supplies `api.judge`', () => {
    mount({
      judge: vi.fn(),
      // `listSeeds` resolving empty is the common production case (most
      // activities have no seed domains) and keeps the picker off screen, so
      // this asserts the judge surface rather than the picker.
      listSeeds: vi.fn().mockResolvedValue([]),
    });

    expect(screen.getByTestId('judge-submit')).toBeInTheDocument();
    expect(screen.getByTestId('judge-submission-input')).toBeInTheDocument();
    // And NOT the reflection surface — the two must never be on screen together.
    expect(screen.queryByTestId('document-reflection-input')).toBeNull();
  });

  it('degrades to the REFLECTION renderer when the host supplies no judge', () => {
    mount(undefined);

    // The degradation is a working activity, not a notice. This is the
    // assertion that would have caught "we returned an error card instead".
    expect(screen.getByTestId('document-reflection-input')).toBeInTheDocument();
    expect(screen.getByTestId('document-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('judge-submit')).toBeNull();
  });

  it('degrades the same way when the port exists but carries no `judge`', () => {
    // The probe is per-METHOD, not per-object: a host that wired `listSeeds`
    // for some other reason has not thereby claimed it can judge. Reading the
    // object's presence instead of the method's is the easiest version of this
    // bug to write.
    mount({ listSeeds: vi.fn().mockResolvedValue([]) });

    expect(screen.getByTestId('document-reflection-input')).toBeInTheDocument();
    expect(screen.queryByTestId('judge-submit')).toBeNull();
  });
});

describe('the visibility notice is fail-closed on the identity port', () => {
  /**
   * `ArtifactVisibilityNotice` used to query Supabase from inside the activity
   * tree; it now reads `identity.artifactAudience`, which the host resolves.
   *
   * The fail-closed default is the product decision, not an implementation
   * detail: telling a learner "your employer can read this" when we could not
   * confirm it teaches them to distrust the notice on the day it is true. So
   * `'unknown'` — the value while the host is still resolving, and the value
   * after a failed resolution — must hide it.
   */
  function mountReflection(artifactAudience?: 'none' | 'tenant' | 'unknown') {
    return render(
      <I18nProvider>
        <ActivityProviderWithAudience audience={artifactAudience}>
          <DocumentActivity
            activity={
              {
                id: 'doc-reflect-1',
                kind: 'document',
                spec: { prompt: 'O que você aprendeu?' },
                rubric: { min_words: 5 },
                status: 'todo',
              } as unknown as Activity
            }
            onComplete={() => {}}
          />
        </ActivityProviderWithAudience>
      </I18nProvider>
    );
  }

  it('shows the notice only for a tenant audience', () => {
    mountReflection('tenant');
    expect(screen.getByTestId('artifact-visibility-notice')).toBeInTheDocument();
  });

  it.each(['none', 'unknown', undefined] as const)(
    'hides it for audience=%s',
    (audience) => {
      mountReflection(audience);
      expect(screen.queryByTestId('artifact-visibility-notice')).toBeNull();
    }
  );
});

function ActivityProviderWithAudience({
  audience,
  children,
}: {
  audience?: 'none' | 'tenant' | 'unknown';
  children: ReactNode;
}) {
  const i18n = useI18n();
  return (
    <ActivityProvider i18n={i18n} identity={{ authenticated: true, artifactAudience: audience }}>
      {children}
    </ActivityProvider>
  );
}
