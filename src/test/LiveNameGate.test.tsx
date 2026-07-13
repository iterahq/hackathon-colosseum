import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import { LiveNameGate } from '@/components/live/LiveNameGate';
import { updateMyProfile } from '@/services/profile.service';

vi.mock('@/services/profile.service', () => ({
  updateMyProfile: vi.fn().mockResolvedValue(true),
}));

function renderGate(onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <LiveNameGate onDone={onDone} />
      </I18nProvider>
    </QueryClientProvider>
  );
  return onDone;
}

describe('LiveNameGate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disables submit until a valid name is typed', () => {
    renderGate();
    const submit = screen.getByTestId('live-name-gate-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('live-name-input'), { target: { value: 'Ana' } });
    expect(submit).not.toBeDisabled();
  });

  it('renders the preset avatar grid and lets you pick one', () => {
    renderGate();
    const options = screen.getAllByTestId('live-avatar-option');
    expect(options.length).toBeGreaterThan(1);
    fireEvent.click(options[2]);
    expect(options[2].getAttribute('data-selected')).toBe('true');
  });

  it('persists name + avatar and reports done', async () => {
    const onDone = renderGate();
    fireEvent.change(screen.getByTestId('live-name-input'), { target: { value: 'Ana Clara' } });
    fireEvent.click(screen.getByTestId('live-name-gate-submit'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateMyProfile).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Ana Clara', avatarUrl: expect.any(String) })
    );
  });
});
