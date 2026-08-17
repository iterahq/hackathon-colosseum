/**
 * `resolveByocSpec` — the app-layer wrapper over the pure resolver.
 *
 * It exists because a real activity row carries bilingual `{pt,en}` bags, and the
 * one BYOC activity in production was authored that way. The pure resolver is
 * locale-blind, so without the collapse here the harness never parsed: itera-api
 * answered 422 `byoc_not_configured` in a second and the player served the
 * authored fallback without a word, for weeks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Activity } from '@/types/content';

vi.mock('@/api/iteraApi', () => ({ iteraApiConfigured: () => true }));

import { resolveByocSpec } from '@/components/branded/activity/byoc/byocSpec';

const bilingualByoc = {
  seed: { prompt: { pt: 'Conte um hobby seu.', en: 'Tell us a hobby.' } },
  harness: {
    interaction: 'pick_best',
    generation_prompt: { pt: 'Monte sobre {seed}', en: 'Build about {seed}' },
  },
};

function activity(kind: Activity['kind'], spec: unknown): Activity {
  return { id: 'a1', kind, spec, status: 'todo' } as unknown as Activity;
}

describe('resolveByocSpec', () => {
  beforeEach(() => localStorage.clear());

  it('collapses a bilingual harness to the active locale', () => {
    const spec = resolveByocSpec(activity('concept', { byoc: bilingualByoc }));
    expect(spec?.harness.generation_prompt).toBe('Monte sobre {seed}');
    expect(spec?.seed.prompt).toBe('Conte um hobby seu.');
  });

  it('follows the reader into English', () => {
    localStorage.setItem('itera.locale', 'en');
    expect(resolveByocSpec(activity('concept', { byoc: bilingualByoc }))?.seed.prompt).toBe(
      'Tell us a hobby.'
    );
  });

  // The services layer hands sandbox specs through UNcollapsed so the
  // sandbox runtime can resolve its own bags — a harness riding on that kind used
  // to be invisible for exactly that reason.
  it('resolves a harness riding on a chat_sandbox, whose spec arrives uncollapsed', () => {
    const spec = resolveByocSpec(
      activity('chat_sandbox', { openness: 'guided', byoc: bilingualByoc })
    );
    expect(spec?.harness.interaction).toBe('pick_best');
  });

  it('still refuses a harness that lost its {seed} placeholder', () => {
    expect(
      resolveByocSpec(
        activity('concept', {
          byoc: {
            ...bilingualByoc,
            harness: { interaction: 'pick_best', generation_prompt: { pt: 'sem', en: 'none' } },
          },
        })
      )
    ).toBeNull();
  });

  it('ignores an activity with no harness', () => {
    expect(resolveByocSpec(activity('concept', { title: 'Só um conceito' }))).toBeNull();
    expect(resolveByocSpec(activity('concept', null))).toBeNull();
  });
});
