/**
 * ProgramPage — visitor mode (2026-09-18). A signed-in user with no active
 * subscription reaches "/program/:slug" too (RequireSubscription
 * mode="preview"). If the slug matches a catalog program, they see a LOCKED
 * preview (title + counts + subscribe CTA) instead of "no access"
 * (ProgramUnavailable); `useProgram` (the RLS-scoped, membership-only read)
 * is never even called for them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import ProgramPage from '@/pages/ProgramPage';
import { pageName } from '@/lib/pageTitle';

const useAccessLevel = vi.fn();
const useProgram = vi.fn();
const useCatalog = vi.fn();

vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => useAccessLevel() }));
vi.mock('@/hooks', () => ({ useProgram: (...args: unknown[]) => useProgram(...args) }));
vi.mock('@/hooks/useCatalog', () => ({ useCatalog: (...args: unknown[]) => useCatalog(...args) }));
// The shell pulls auth, membership and stats hooks for the top bar; the page only needs its children.
vi.mock('@/components/courses/CoursesShell', () => ({ CoursesShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/branded/LockedProgramView', () => ({
  LockedProgramView: ({ program }: { program: { title: { pt?: string } } }) => (
    <div data-testid="program-locked">{program.title.pt}</div>
  ),
}));

function renderPage(slug = 'modele-dados-com-ia') {
  return render(
    <MemoryRouter initialEntries={[`/program/${slug}`]}>
      <I18nProvider>
        <Routes>
          <Route path="/program/:slug" element={<ProgramPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAccessLevel.mockReset();
  useProgram.mockReset();
  useCatalog.mockReset();
});

describe('ProgramPage — visitor mode', () => {
  it('renders the locked preview when the slug matches a catalog program, without calling useProgram', () => {
    useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
    useProgram.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() });
    useCatalog.mockReturnValue({
      data: [
        {
          id: 'p1',
          tenantId: 't',
          tenantSlug: 'itera',
          slug: 'modele-dados-com-ia',
          title: { pt: 'Modele seus dados com IA' },
          createdAt: '',
          unitCount: 1,
          lessonCount: 2,
          activityCount: 8,
          alreadyEnrolled: false,
        },
      ],
      isPending: false,
    });

    renderPage('modele-dados-com-ia');

    expect(screen.getByTestId('program-locked')).toHaveTextContent('Modele seus dados com IA');
    expect(useProgram).toHaveBeenCalledWith(undefined);
    expect(pageName.get()).toBe('Modele seus dados com IA');
  });

  it('falls back to ProgramUnavailable when the slug is not in the catalog either', () => {
    useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
    useProgram.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() });
    useCatalog.mockReturnValue({ data: [], isPending: false });

    renderPage('nonexistent-course');

    expect(screen.getByTestId('program-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('program-locked')).not.toBeInTheDocument();
    expect(screen.getByTestId('program-unavailable-subscribe')).toHaveAttribute('href', '/subscribe');
    expect(screen.queryByTestId('program-unavailable-retry')).not.toBeInTheDocument();
  });

  it('offers a retry when the catalog lookup itself failed', () => {
    const refetch = vi.fn();
    useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
    useProgram.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() });
    useCatalog.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });

    renderPage('fundamentos-web');
    fireEvent.click(screen.getByTestId('program-unavailable-retry'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('a member (non-visitor) still uses useProgram normally', () => {
    useAccessLevel.mockReturnValue({ level: 'member', entitlementError: false });
    useProgram.mockReturnValue({
      data: { id: 'p1', slug: 'x', title: { pt: 'X' }, createdAt: '', icon: 'code', units: [] },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useCatalog.mockReturnValue({ data: [], isPending: false });

    renderPage('x');

    expect(useProgram).toHaveBeenCalledWith('x');
    expect(screen.queryByTestId('program-locked')).not.toBeInTheDocument();
  });
});
