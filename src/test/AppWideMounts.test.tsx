import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The guest route must NOT mount the app-wide components (plan
 * 20260728-itera-guest-link-aula-sincrona, ADR-3):
 *
 *  - `LocaleSync` WRITES `itera.users.locale`. A link-invited guest has no
 *    business persisting a language preference on a throwaway row.
 *  - `LiveClassSignal` READS the user's memberships (a guest has ZERO) and toasts
 *    a deep link into the authenticated `/live/:id` — i.e. it is a doorway from
 *    the guest surface straight into the login wall. That is exactly the leak the
 *    separate route exists to close.
 *
 * This asserts the decision at its single home (AppWideMounts), so it cannot be
 * half-applied by someone re-adding a mount in App.tsx.
 */

const mocks = vi.hoisted(() => ({ localeSync: vi.fn() }));

vi.mock('@/hooks/useLocaleSync', () => ({ useLocaleSync: () => mocks.localeSync() }));
vi.mock('@/components/branded/LiveClassSignal', () => ({
  LiveClassSignal: () => <div data-testid="live-class-signal" />,
}));

import { AppWideMounts } from '@/components/AppWideMounts';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppWideMounts />
    </MemoryRouter>
  );
}

describe('AppWideMounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mounts LocaleSync + LiveClassSignal on a normal route', () => {
    renderAt('/live/abc-123');
    expect(screen.getByTestId('live-class-signal')).toBeInTheDocument();
    expect(mocks.localeSync).toHaveBeenCalled();
  });

  it('mounts NEITHER on the guest route', () => {
    renderAt('/g/ABCD2345');
    expect(screen.queryByTestId('live-class-signal')).toBeNull();
    expect(mocks.localeSync).not.toHaveBeenCalled();
  });

  it('keeps them off for any path under the guest prefix', () => {
    renderAt('/g/ABCD2345/whatever');
    expect(screen.queryByTestId('live-class-signal')).toBeNull();
    expect(mocks.localeSync).not.toHaveBeenCalled();
  });
});
