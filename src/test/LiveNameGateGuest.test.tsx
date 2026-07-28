import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { LiveNameGate } from '@/components/live/LiveNameGate';
import { updateMyProfile } from '@/services/profile.service';
import { createGuestSession } from '@/services/guestSession.service';

/**
 * The name+avatar step is ONE component with TWO persistence modes (plan
 * 20260728-…): for a member it UPDATEs `itera.users` (a row that already exists);
 * for a guest there is no row, no session and no account, so the same submit
 * mints a Supabase session from the class code instead.
 *
 * The critical assertion is the NEGATIVE one: guest mode must never call
 * `updateMyProfile` — that UPDATE is gated by `users_update_self` and would fail
 * for someone who has no itera.users row yet.
 */

vi.mock('@/services/profile.service', () => ({
  updateMyProfile: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/services/guestSession.service', () => ({
  createGuestSession: vi.fn(),
}));

const joined = {
  code: 'ABCD2345',
  sessionId: 'sess-1',
  iteraUserId: 'user-1',
  displayName: 'Ana Clara',
  avatarUrl: null,
};

function renderGuestGate() {
  const onJoined = vi.fn();
  const onDone = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <LiveNameGate onDone={onDone} guest={{ code: 'ABCD2345', onJoined }} />
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onJoined, onDone };
}

describe('LiveNameGate — guest mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGuestSession).mockResolvedValue(joined);
  });

  it('marks itself as the guest variant and keeps the same form', () => {
    renderGuestGate();
    expect(screen.getByTestId('live-name-gate').getAttribute('data-mode')).toBe('guest');
    expect(screen.getByTestId('live-name-input')).toBeInTheDocument();
    expect(screen.getAllByTestId('live-avatar-option').length).toBeGreaterThan(1);
  });

  it('joins through the guest endpoint and NEVER touches updateMyProfile', async () => {
    const { onJoined, onDone } = renderGuestGate();
    fireEvent.change(screen.getByTestId('live-name-input'), { target: { value: 'Ana Clara' } });
    fireEvent.click(screen.getByTestId('live-name-gate-submit'));

    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(joined));
    expect(createGuestSession).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABCD2345', name: 'Ana Clara', avatarUrl: expect.any(String) })
    );
    expect(updateMyProfile).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('surfaces a dead/expired code inline instead of navigating anywhere', async () => {
    vi.mocked(createGuestSession).mockRejectedValue(new Error('code not live'));
    const { onJoined } = renderGuestGate();
    fireEvent.change(screen.getByTestId('live-name-input'), { target: { value: 'Ana Clara' } });
    fireEvent.click(screen.getByTestId('live-name-gate-submit'));

    await waitFor(() => expect(screen.getByTestId('live-name-gate-error')).toBeInTheDocument());
    expect(onJoined).not.toHaveBeenCalled();
    // Still usable — the guest can retry without losing what they typed.
    expect(screen.getByTestId('live-name-gate-submit')).not.toBeDisabled();
  });

  it('leaves the member path untouched (still updates the profile)', async () => {
    const onDone = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <I18nProvider>
          <LiveNameGate onDone={onDone} />
        </I18nProvider>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('live-name-gate').getAttribute('data-mode')).toBe('member');
    fireEvent.change(screen.getByTestId('live-name-input'), { target: { value: 'Bruno' } });
    fireEvent.click(screen.getByTestId('live-name-gate-submit'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateMyProfile).toHaveBeenCalled();
    expect(createGuestSession).not.toHaveBeenCalled();
  });
});
