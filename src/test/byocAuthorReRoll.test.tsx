/**
 * The author's re-roll inside the test harness.
 *
 * Generation is idempotent per (learner, activity), so an author who tests a BYOC
 * activity once, edits `generation_prompt` and re-opens this page gets their FIRST
 * roll back — reading every prompt edit as a no-op. The server honors `regenerate`
 * over a real generation for whoever can author the activity; this is the caller.
 * Without it the server-side rule is unreachable code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';

vi.mock('@/api/iteraApi', () => ({ iteraApiConfigured: () => true }));

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

const BYOC: Activity = {
  id: 'a1',
  kind: 'concept',
  status: 'todo',
  spec: {
    byoc: {
      seed: { prompt: 'Conte um hobby seu.' },
      harness: { interaction: 'pick_best', generation_prompt: 'Monte sobre {seed}' },
    },
  },
} as unknown as Activity;

const PLAIN: Activity = { id: 'a2', kind: 'concept', status: 'todo', spec: {} } as unknown as Activity;

function mount(activity: Activity) {
  return render(
    <I18nProvider>
      <ActivityTestHarness activity={activity} />
    </I18nProvider>
  );
}

beforeEach(() => {
  readByoc.mockReset().mockResolvedValue({ seed: 'meu hobby é violão', generated: {} });
  generateByoc.mockReset().mockResolvedValue({ generated: {}, reused: false });
  localStorage.clear();
});

describe('BYOC author re-roll in the test harness', () => {
  it('asks the server for a genuinely new tree', async () => {
    mount(BYOC);
    await screen.findByTestId('byoc-author-reroll');
    await waitFor(() => expect(screen.getByTestId('byoc-author-seed')).toHaveValue('meu hobby é violão'));

    await userEvent.click(screen.getByTestId('byoc-author-regenerate'));

    await waitFor(() => expect(generateByoc).toHaveBeenCalledTimes(1));
    // The 4th argument IS the fix — without it the server serves the cached row.
    expect(generateByoc).toHaveBeenCalledWith('a1', 'meu hobby é violão', 'author-token', true);
  });

  it('remounts the renderer so the author sees the new tree', async () => {
    mount(BYOC);
    const before = screen.getByTestId('renderer');
    await waitFor(() => expect(screen.getByTestId('byoc-author-seed')).toHaveValue('meu hobby é violão'));

    await userEvent.click(screen.getByTestId('byoc-author-regenerate'));

    await waitFor(() => expect(screen.getByTestId('renderer')).not.toBe(before));
  });

  it('tells the author the generation IS persisted, unlike everything else here', async () => {
    mount(BYOC);
    expect(screen.getByTestId('test-sandbox-banner')).toHaveTextContent(
      'Modo de teste — nada é salvo, exceto a geração BYOC'
    );
  });

  it('leaves the plain sandbox promise untouched on a non-BYOC activity', () => {
    mount(PLAIN);
    expect(screen.getByTestId('test-sandbox-banner')).toHaveTextContent('Modo de teste — nada é salvo');
    expect(screen.queryByTestId('byoc-author-reroll')).toBeNull();
    expect(readByoc).not.toHaveBeenCalled();
  });

  // The server refuses by answering 200 with the OLD row, not by erroring. Taking
  // that as success is the original bug wearing a button.
  it('says so when the server DECLINED and handed the same generation back', async () => {
    generateByoc.mockResolvedValue({ generated: {}, reused: true });
    mount(BYOC);
    const before = screen.getByTestId('renderer');
    await waitFor(() => expect(screen.getByTestId('byoc-author-seed')).toHaveValue('meu hobby é violão'));

    await userEvent.click(screen.getByTestId('byoc-author-regenerate'));

    expect(await screen.findByTestId('byoc-author-error')).toHaveTextContent('papel de autor');
    expect(screen.getByTestId('renderer')).toBe(before);
  });

  it('surfaces a failed re-roll instead of pretending it worked', async () => {
    generateByoc.mockRejectedValue(new Error('boom'));
    mount(BYOC);
    await waitFor(() => expect(screen.getByTestId('byoc-author-seed')).toHaveValue('meu hobby é violão'));

    await userEvent.click(screen.getByTestId('byoc-author-regenerate'));

    expect(await screen.findByTestId('byoc-author-error')).toBeInTheDocument();
  });

  it('does not offer a re-roll with no context to re-roll on', async () => {
    readByoc.mockResolvedValue(null);
    mount(BYOC);
    await screen.findByTestId('byoc-author-reroll');
    expect(screen.getByTestId('byoc-author-regenerate')).toBeDisabled();
  });
});
