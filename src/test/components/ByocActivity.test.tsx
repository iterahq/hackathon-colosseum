import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity } from '@/types/content';
import type { ByocGeneration } from '@/types/byoc';

/**
 * BYOC rides on `spec.byoc` rather than on an `activity_kind`, so the two things
 * worth pinning are the GATE (does the right activity take the BYOC path, and
 * does everything else stay on its own kind) and the two-step flow.
 */

const { generateByoc, readByoc, configured, auth } = vi.hoisted(() => ({
  generateByoc: vi.fn(),
  readByoc: vi.fn(),
  configured: vi.fn(() => true),
  auth: { session: { access_token: 'tok' } as { access_token: string } | null, loading: false },
}));

vi.mock('@/api/iteraByoc', () => ({ generateByoc, readByoc }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/api/iteraApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/iteraApi')>()),
  iteraApiConfigured: configured,
}));

const byocSpec = {
  seed: { prompt: 'Conte um hobby seu.', example: 'aquarela' },
  harness: {
    generation_prompt: 'Crie duas versões de um pedido sobre {seed}.',
    interaction: 'pick_best' as const,
  },
};

const fallbackTree = {
  interaction: 'pick_best' as const,
  options: [
    { id: 'a', content: 'Me ajuda com bolo.', ai_response: 'Bolo é uma massa assada...' },
    {
      id: 'b',
      content: 'Faço bolo de cenoura pra vender. Escreve uma legenda de 2 linhas.',
      ai_response: 'Sábado tem fornada quentinha de bolo de cenoura...',
    },
  ],
  correct_option_id: 'b',
};

const activity: Activity = {
  id: 'act-byoc',
  lessonId: 'l1',
  ordinal: 1,
  kind: 'concept',
  spec: { title: 'Contexto importa', byoc: byocSpec },
  rubric: {},
};

const generation: ByocGeneration = {
  generation_id: 'g1',
  activity_id: 'act-byoc',
  attempt: 1,
  seed: 'futebol',
  mode: 'choice_tree',
  generated: {
    interaction: 'pick_best',
    options: [
      { id: 'a', content: 'Pedido vago', ai_response: 'Resposta genérica' },
      { id: 'b', content: 'Pedido com contexto', ai_response: 'Resposta sob medida' },
    ],
    correct_option_id: 'b',
  },
  fallback_used: false,
  attempts_used: 1,
  model: 'free',
  degraded_reason: null,
  attempt_notes: [],
  created_at: null,
  reused: false,
  generation_available: true,
  persisted: true,
};

function renderActivity(a: Activity, onComplete = vi.fn()) {
  render(
    <I18nProvider>
      <ActivityRenderer activity={a} onComplete={onComplete} />
    </I18nProvider>
  );
  return onComplete;
}

beforeEach(() => {
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  auth.session = { access_token: 'tok' };
  auth.loading = false;
  readByoc.mockResolvedValue(null);
  generateByoc.mockResolvedValue(generation);
});

describe('gate', () => {
  it('leaves an activity without a byoc harness on its own kind', async () => {
    renderActivity({ ...activity, spec: { title: 'Contexto importa' } });
    await waitFor(() => expect(screen.queryByTestId('byoc-seed-form')).toBeNull());
    expect(readByoc).not.toHaveBeenCalled();
  });

  it('falls through to the host kind when itera-api is not configured', async () => {
    configured.mockReturnValue(false);
    renderActivity(activity);
    await waitFor(() => expect(screen.queryByTestId('byoc-seed-form')).toBeNull());
  });

  it('ignores an explicit but invalid byoc block instead of hijacking the render', async () => {
    renderActivity({ ...activity, spec: { byoc: { seed: { prompt: 'oi' } } } });
    await waitFor(() => expect(screen.queryByTestId('byoc-seed-form')).toBeNull());
  });
});

describe('two-step flow', () => {
  it('collects a seed, generates, then grades by lookup', async () => {
    const onComplete = renderActivity(activity);
    const input = await screen.findByTestId('byoc-seed-input');
    fireEvent.change(input, { target: { value: 'futebol' } });
    fireEvent.click(screen.getByTestId('byoc-seed-submit'));

    await screen.findByTestId('byoc-tree');
    expect(generateByoc).toHaveBeenCalledWith('act-byoc', 'futebol', 'tok');

    fireEvent.click(screen.getAllByTestId('byoc-pick-option')[1]);
    fireEvent.click(screen.getByTestId('byoc-submit'));
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('carries the host kind instruction over, since the layer replaces its render', async () => {
    readByoc.mockResolvedValue(generation);
    renderActivity({
      ...activity,
      spec: { instruction: { text: 'Contexto muda a resposta da IA.' }, byoc: byocSpec },
    });
    expect((await screen.findByTestId('byoc-tree')).ownerDocument.body.textContent).toContain(
      'Contexto muda a resposta da IA.'
    );
  });

  it('stays locked when the activity was already completed', async () => {
    readByoc.mockResolvedValue(generation);
    renderActivity({ ...activity, status: 'done' });
    await screen.findByTestId('byoc-tree');
    fireEvent.click(screen.getAllByTestId('byoc-pick-option')[1]);
    fireEvent.click(screen.getByTestId('byoc-submit'));
    expect(screen.queryAllByTestId('byoc-ai-response')).toHaveLength(0);
  });

  it('reuses an existing generation instead of asking for the seed again', async () => {
    readByoc.mockResolvedValue({ ...generation, reused: true });
    renderActivity(activity);
    await screen.findByTestId('byoc-tree');
    expect(screen.queryByTestId('byoc-seed-form')).toBeNull();
    expect(generateByoc).not.toHaveBeenCalled();
  });

  it('degrades instead of crashing when the seed is refused', async () => {
    const { IteraApiError } = await import('@/api/iteraApiError');
    generateByoc.mockRejectedValue(
      new IteraApiError(422, 'seed_not_allowed', 'Escolha outro tema.', '')
    );
    renderActivity(activity);
    fireEvent.change(await screen.findByTestId('byoc-seed-input'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('byoc-seed-submit'));

    expect((await screen.findByTestId('byoc-seed-error')).textContent).toContain('Escolha outro tema.');
    expect(screen.getByTestId('byoc-seed-form')).toBeTruthy();
  });

  it('waits for auth to settle instead of firing with an empty token', async () => {
    auth.loading = true;
    auth.session = null;
    renderActivity(activity);
    await waitFor(() => expect(screen.queryByTestId('byoc-seed-form')).toBeNull());
    expect(readByoc).not.toHaveBeenCalled();
  });

  it('renders the authored fallback tree instead of stranding the learner', async () => {
    generateByoc.mockRejectedValue(new Error('rede caiu'));
    renderActivity({ ...activity, spec: { byoc: { ...byocSpec, fallback: fallbackTree } } });
    fireEvent.change(await screen.findByTestId('byoc-seed-input'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('byoc-seed-submit'));

    await screen.findByTestId('byoc-fallback-note');
    expect(screen.getByTestId('byoc-tree')).toBeTruthy();
  });

  it('re-reads on retry, since the failed generation may have landed anyway', async () => {
    generateByoc.mockRejectedValue(new Error('rede caiu'));
    renderActivity(activity);
    fireEvent.change(await screen.findByTestId('byoc-seed-input'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('byoc-seed-submit'));

    await screen.findByTestId('byoc-retry');
    readByoc.mockResolvedValue(generation);
    fireEvent.click(screen.getByTestId('byoc-retry'));
    await screen.findByTestId('byoc-tree');
    expect(readByoc).toHaveBeenCalledTimes(2);
  });

  it('keeps the AI response hidden until the learner commits', async () => {
    readByoc.mockResolvedValue(generation);
    renderActivity(activity);
    await screen.findByTestId('byoc-tree');
    expect(screen.queryAllByTestId('byoc-ai-response')).toHaveLength(0);

    fireEvent.click(screen.getAllByTestId('byoc-pick-option')[0]);
    fireEvent.click(screen.getByTestId('byoc-submit'));
    expect(screen.getAllByTestId('byoc-ai-response')).toHaveLength(2);
  });
});

/**
 * A degraded generation is PERSISTED, so idempotency serves it back forever. The
 * learner would answer the ready-made example on every reload with their own
 * context echoed above it, as if it had been used to build the question.
 */
describe('degraded generation', () => {
  const degraded = { ...generation, fallback_used: true, generation_available: false, reused: true };

  it('says the context was not used instead of echoing it back', async () => {
    readByoc.mockResolvedValue(degraded);
    renderActivity(activity);
    await screen.findByTestId('byoc-fallback-note');
    expect(screen.queryByTestId('byoc-seed-echo')).toBeNull();
  });

  // The re-roll affordance was removed: the server keeps generating after the
  // client stops waiting, so the next read lands on the real tree on its own.
  // Offering a re-roll here also handed the learner a second, different question
  // for the same graded activity.
  it('offers no re-roll out of the degraded row', async () => {
    readByoc.mockResolvedValue(degraded);
    renderActivity(activity);
    await screen.findByTestId('byoc-fallback-note');
    expect(screen.queryByTestId('byoc-try-another-seed')).toBeNull();
  });
});
