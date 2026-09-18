import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import CatalogPage from '@/pages/CatalogPage';

/**
 * CatalogPage — discovery + enroll surface (round-1 finding #1). The catalog
 * hooks are mocked; we assert the flagship is listed and the enroll button wires
 * the mutation + navigates to the course on success.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const mutateAsync = vi.fn();
const useCatalog = vi.fn();
const useEnroll = vi.fn();
vi.mock('@/hooks/useCatalog', () => ({
  useCatalog: () => useCatalog(),
  useEnroll: () => useEnroll(),
}));

const useAccessLevel = vi.fn();
vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => useAccessLevel() }));

// AppHeader pulls auth/membership/branding hooks; stub it. ProgramCard is the
// shared rich card — stub it to a thin shell that renders its title + footer
// slot so the enroll/open CTAs (in the footer) stay assertable here. (The rich
// card itself is covered by ProgramCard.test.tsx + the catalog e2e.)
// LockedCatalogCard (visitor mode) is stubbed the same way, minus useEnroll —
// its own CTA is `catalog-locked-cta`.
vi.mock('@/components/branded', () => ({
  AppHeader: () => <div data-testid="app-header" />,
  ProgramIcon: () => <div data-testid="program-icon" />,
  ProgramCard: ({
    program,
    footer,
  }: {
    program: { title: { pt?: string; en?: string } };
    footer?: ReactNode;
  }) => (
    <div data-testid="program-card">
      <span>{program.title.pt ?? program.title.en}</span>
      {footer}
    </div>
  ),
  LockedCatalogCard: ({ program }: { program: { title: { pt?: string; en?: string } } }) => (
    <div data-testid="program-card">
      <span>{program.title.pt ?? program.title.en}</span>
      <button type="button" data-testid="catalog-locked-cta">
        Subscribe
      </button>
    </div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <CatalogPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockReset();
  mutateAsync.mockReset();
  useEnroll.mockReturnValue({ mutateAsync, isPending: false, isError: false });
  useAccessLevel.mockReturnValue({ level: 'member', entitlementError: false });
});

describe('CatalogPage', () => {
  it('lists the flagship catalog course with an Enroll button', () => {
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
      isError: false,
    });
    renderPage();
    expect(screen.getByText(/Modele seus dados com IA/i)).toBeInTheDocument();
    expect(screen.getByTestId('catalog-enroll')).toBeInTheDocument();
  });

  it('enrolls then navigates to the course', async () => {
    mutateAsync.mockResolvedValueOnce({ tenantId: 't', role: 'learner', enrolled: true });
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
      isError: false,
    });
    renderPage();
    fireEvent.click(screen.getByTestId('catalog-enroll'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/program/modele-dados-com-ia'));
  });

  it('an already-enrolled course shows Open (not Enroll)', () => {
    useCatalog.mockReturnValue({
      data: [
        {
          id: 'p1',
          tenantId: 't',
          tenantSlug: 'itera',
          slug: 'modele-dados-com-ia',
          title: { pt: 'Modele' },
          createdAt: '',
          unitCount: 1,
          lessonCount: 2,
          activityCount: 8,
          alreadyEnrolled: true,
        },
      ],
      isPending: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByTestId('catalog-open')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-enroll')).toBeNull();
  });

  it('renders the empty state when no catalog courses', () => {
    useCatalog.mockReturnValue({ data: [], isPending: false, isError: false });
    renderPage();
    expect(screen.getByTestId('catalog-empty')).toBeInTheDocument();
  });

  describe('visitor mode (no active subscription)', () => {
    beforeEach(() => {
      useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
    });

    it('shows the locked CTA instead of Enroll, and never calls useEnroll', () => {
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
        isError: false,
      });
      renderPage();
      expect(screen.getByText(/Modele seus dados com IA/i)).toBeInTheDocument();
      expect(screen.getByTestId('catalog-locked-cta')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-enroll')).not.toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });
  });
});
