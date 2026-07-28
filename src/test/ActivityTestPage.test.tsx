/**
 * ActivityTestPage — `/author/activities/:activityId/test`.
 *
 * Regression cover for E2E finding D5 (2026-07-28): a non-existent activity id
 * left the page on "Loading activity…" forever. PostgREST answers an unknown id
 * with an empty 200 (no HTTP error), so the not-found case has to be raised and
 * rendered explicitly — with a way back — otherwise it reads as a permanent
 * spinner. ADR-10 of 20260728-itera-back-office deep-links straight into this
 * route, so stale ids are expected traffic, not an edge case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { ActivityNotFoundError } from '@/services/authorCanvas.service';
import ActivityTestPage from '@/pages/author/ActivityTestPage';

const useActivity = vi.fn();
vi.mock('@/hooks/useAuthorCanvas', () => ({
  useActivity: (id?: string) => useActivity(id),
}));

vi.mock('@/components/branded', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

vi.mock('@/components/author/ActivityTestHarness', () => ({
  ActivityTestHarness: () => <div data-testid="test-harness" />,
}));

const MISSING = '00000000-0000-4000-8000-000000000000';

function renderPage(entry = `/author/activities/${MISSING}/test`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <Routes>
          <Route path="/author/activities/:activityId/test" element={<ActivityTestPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

const pending = { data: undefined, isPending: true, isError: false, error: null, refetch: vi.fn() };

beforeEach(() => {
  useActivity.mockReset();
});

describe('ActivityTestPage not-found state (E2E D5)', () => {
  it('renders a NOT-FOUND state — not a spinner — for an id that resolves to nothing', () => {
    useActivity.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ActivityNotFoundError(MISSING),
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByTestId('activity-not-found')).toBeInTheDocument();
    // The failure mode being fixed: the spinner must be gone.
    expect(screen.queryByTestId('test-loading')).toBeNull();
    // And it must not read as a transient/retryable transport error.
    expect(screen.queryByTestId('test-load-error')).toBeNull();
    expect(screen.getByText('Atividade não encontrada')).toBeInTheDocument();
  });

  it('offers a path back out of the dead screen', () => {
    useActivity.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ActivityNotFoundError(MISSING),
      refetch: vi.fn(),
    });
    renderPage(`/author/activities/${MISSING}/test?unit=u1`);

    expect(screen.getByTestId('activity-not-found-back')).toHaveAttribute(
      'href',
      '/author/units/u1/canvas'
    );
    expect(screen.getByTestId('activity-not-found-author')).toHaveAttribute('href', '/author');
  });

  it('falls back to /author when the deep-link carries no originating unit', () => {
    useActivity.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ActivityNotFoundError(MISSING),
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('activity-not-found-back')).toHaveAttribute('href', '/author');
  });

  it('still shows the spinner while the activity is genuinely loading', () => {
    useActivity.mockReturnValue(pending);
    renderPage();
    expect(screen.getByTestId('test-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-not-found')).toBeNull();
  });

  it('keeps the retryable error state for a real transport failure', () => {
    useActivity.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('network down'),
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('test-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-not-found')).toBeNull();
  });

  it('mounts the harness when the activity resolves', () => {
    useActivity.mockReturnValue({
      data: { id: 'a1', lessonId: 'l1', ordinal: 1, kind: 'quiz', spec: {}, rubric: null },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('test-harness')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-not-found')).toBeNull();
    expect(screen.queryByTestId('test-loading')).toBeNull();
  });

  it('localizes the chrome instead of hardcoding English', () => {
    useActivity.mockReturnValue(pending);
    renderPage();
    expect(screen.getByTestId('test-page-title')).toHaveTextContent('Testar como aluno');
  });
});
