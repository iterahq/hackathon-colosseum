/**
 * The two ways BYOC fails an author in SILENCE.
 *
 * A refused harness makes the resolver answer "not BYOC", so the whole author
 * panel vanishes and the learner-facing fallback renders like a working activity.
 * A degraded generation is worse: it is a 200 that looks identical to a real roll.
 * Both are correct for the learner (ADR-7) and useless for the author.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';

const apiConfigured = vi.fn(() => true);
vi.mock('@/api/iteraApi', () => ({ iteraApiConfigured: () => apiConfigured() }));

const readByoc = vi.fn();
const generateByoc = vi.fn();
vi.mock('@/api/iteraByoc', () => ({
  readByoc: (...a: unknown[]) => readByoc(...a),
  generateByoc: (...a: unknown[]) => generateByoc(...a),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'author-token' }, loading: false }),
}));

vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: () => <div data-testid="renderer" />,
}));

import { ActivityTestHarness } from '@/components/author/ActivityTestHarness';

function activity(spec: unknown): Activity {
  return { id: 'a1', kind: 'concept', status: 'todo', spec } as unknown as Activity;
}

const VALID = activity({
  byoc: {
    seed: { prompt: 'Conte um hobby seu.' },
    harness: { interaction: 'pick_best', generation_prompt: 'Monte sobre {seed}' },
  },
});

// Claims BYOC by key presence, but the harness has no `generation_prompt` — the
// exact shape that reached production and produced a 1s "success".
const BROKEN = activity({ byoc: { seed: { prompt: 'Conte um hobby seu.' }, harness: {} } });

const row = (over: Record<string, unknown> = {}) => ({
  seed: 'meu hobby é violão',
  generated: {},
  reused: false,
  fallback_used: false,
  attempts_used: 1,
  model: 'meta-llama/llama-3.3-70b',
  degraded_reason: null,
  ...over,
});

function mount(a: Activity) {
  return render(
    <I18nProvider>
      <ActivityTestHarness activity={a} />
    </I18nProvider>
  );
}

beforeEach(() => {
  apiConfigured.mockReturnValue(true);
  readByoc.mockReset().mockResolvedValue(row());
  generateByoc.mockReset().mockResolvedValue(row());
  localStorage.clear();
});

describe('BYOC author diagnosis', () => {
  it('says WHY a harness was refused instead of just disappearing', async () => {
    mount(BROKEN);
    const card = await screen.findByTestId('byoc-author-diagnosis');
    expect(card).toHaveAttribute('data-byoc-state', 'invalid');
    // The package's own reason, not a generic message — it names the failing path.
    expect(card.textContent).toMatch(/generation_prompt/);
    expect(screen.queryByTestId('byoc-author-reroll')).toBeNull();
  });

  it('separates a missing API from a bad spec', async () => {
    apiConfigured.mockReturnValue(false);
    mount(VALID);
    const card = await screen.findByTestId('byoc-author-diagnosis');
    expect(card).toHaveAttribute('data-byoc-state', 'api-missing');
  });

  it('stays quiet when the harness parses', async () => {
    mount(VALID);
    await screen.findByTestId('byoc-author-reroll');
    expect(screen.queryByTestId('byoc-author-diagnosis')).toBeNull();
  });

  it('leaves a non-BYOC activity alone', () => {
    mount(activity({}));
    expect(screen.queryByTestId('byoc-author-diagnosis')).toBeNull();
  });
});

describe('BYOC generation provenance', () => {
  it('names the model behind the tree on screen', async () => {
    mount(VALID);
    const strip = await screen.findByTestId('byoc-author-provenance');
    expect(strip).toHaveAttribute('data-fallback', 'false');
    expect(strip.textContent).toMatch(/llama-3\.3-70b/);
  });

  it('calls a degraded row what it is, with the reason', async () => {
    readByoc.mockResolvedValue(row({ fallback_used: true, degraded_reason: 'model_timeout' }));
    mount(VALID);
    const strip = await screen.findByTestId('byoc-author-provenance');
    expect(strip).toHaveAttribute('data-fallback', 'true');
    expect(screen.getByTestId('byoc-author-degraded')).toHaveTextContent('model_timeout');
  });

  // Elapsed is the tell that survives a wrong `fallback_used`: a real roll takes
  // tens of seconds, so a three-second "generation" never called a model.
  it('times the roll it just made, and only that one', async () => {
    mount(VALID);
    await waitFor(() => expect(screen.getByTestId('byoc-author-seed')).toHaveValue('meu hobby é violão'));
    expect(screen.queryByTestId('byoc-author-elapsed')).toBeNull();

    await userEvent.click(screen.getByTestId('byoc-author-regenerate'));

    expect(await screen.findByTestId('byoc-author-elapsed')).toBeInTheDocument();
  });
});
