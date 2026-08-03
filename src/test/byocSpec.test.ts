import { describe, it, expect } from 'vitest';
import { byocSpecFromRaw } from '@/utils/byocSpec';

const harness = {
  seed: { prompt: 'Conte um hobby seu.' },
  harness: { generation_prompt: 'Crie duas versões sobre {seed}.', interaction: 'pick_best' },
};

describe('byocSpecFromRaw', () => {
  it('reads a nested harness riding on another kind', () => {
    expect(byocSpecFromRaw({ title: 'Contexto importa', byoc: harness })?.harness.interaction).toBe(
      'pick_best'
    );
  });

  it('reads a spec root that is itself a harness', () => {
    expect(byocSpecFromRaw(harness)?.seed.prompt).toBe('Conte um hobby seu.');
  });

  it('refuses an explicit but invalid byoc block instead of falling through to the root', () => {
    expect(byocSpecFromRaw({ ...harness, byoc: { seed: { prompt: 'oi' } } })).toBeNull();
  });

  // Locale-blind BY DESIGN: collapsing bilingual bags is `resolveByocSpec`'s job,
  // and it has to stay one layer up because the locale lives in the app, not here.
  it('refuses a bilingual generation_prompt, which only the app layer can collapse', () => {
    expect(
      byocSpecFromRaw({
        ...harness,
        harness: {
          interaction: 'pick_best',
          generation_prompt: { pt: 'Gere sobre {seed}', en: 'Generate about {seed}' },
        },
      })
    ).toBeNull();
  });

  it('ignores a spec that carries no harness', () => {
    expect(byocSpecFromRaw({ title: 'Só um conceito' })).toBeNull();
    expect(byocSpecFromRaw(null)).toBeNull();
    expect(byocSpecFromRaw([harness])).toBeNull();
  });

  it('does not mistake sandbox_scenario openness:byoc for the harness layer', () => {
    expect(byocSpecFromRaw({ openness: 'byoc', persona: { name: 'Ana' } })).toBeNull();
  });
});
