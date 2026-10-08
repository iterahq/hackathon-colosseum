import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import CatalogRoute from '@/pages/CatalogRoute';

/**
 * The web host of the universal catalog screen: discovery + enroll surface (round-1 finding #1). The
 * catalog hooks are mocked and the REAL screen renders, so what is asserted is what a learner sees and
 * what each control does. The cases of the two old tests (`CatalogCard.test.tsx`, `CatalogPage.test.tsx`)
 * live here; the screen's own states and callbacks are in `packages/screens/src/catalog/CatalogScreen.test.tsx`.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

// The enroll mutation is the REAL one (`useEnroll`, TanStack): only the catalog read and the RPC are stubbed.
const enrollInProgram = vi.fn();
const useCatalog = vi.fn();
vi.mock('@/hooks/useCatalog', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useCatalog')>()),
  useCatalog: () => useCatalog(),
}));
vi.mock('@/services/catalog.service', () => ({
  getCatalogPrograms: vi.fn(),
  enrollInProgram: (programId: string) => enrollInProgram(programId),
}));

const useAccessLevel = vi.fn();
vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => useAccessLevel() }));

const useShellSurface = vi.fn();
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => useShellSurface() }));

// AppHeader pulls auth/membership/branding hooks; the header slot only needs to be there.
vi.mock('@/components/branded/AppHeader', () => ({ AppHeader: () => <div data-testid="app-header" /> }));

const program = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

const ready = (...programs: ReturnType<typeof program>[]) => useCatalog.mockReturnValue({ data: programs, isPending: false, isError: false });

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <I18nProvider>
          <CatalogRoute />
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockReset();
  enrollInProgram.mockReset();
  useAccessLevel.mockReturnValue({ level: 'member', entitlementError: false });
  useShellSurface.mockReturnValue('web');
});

describe('CatalogRoute', () => {
  it('lists the flagship catalog course with an Enroll button, under the app header', () => {
    ready(program());
    renderPage();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByText(/Modele seus dados com IA/i)).toBeInTheDocument();
    expect(screen.getByTestId('catalog-enroll')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-open')).not.toBeInTheDocument();
  });

  it('counts are singular-aware ("1 lição", not "1 lições")', () => {
    ready(program({ lessonCount: 1, unitCount: 3, activityCount: 1 }));
    renderPage();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1 lição', '3 unidades', '1 atividade']);
  });

  it('enrolls then navigates to the course', async () => {
    enrollInProgram.mockResolvedValueOnce({ tenantId: 't', role: 'learner', enrolled: true });
    ready(program());
    renderPage();
    fireEvent.click(screen.getByTestId('catalog-enroll'));
    await waitFor(() => expect(enrollInProgram).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/program/modele-dados-com-ia'));
  });

  it('stays on the page when enrollment fails', async () => {
    enrollInProgram.mockRejectedValueOnce(new Error('rpc'));
    ready(program());
    renderPage();
    fireEvent.click(screen.getByTestId('catalog-enroll'));
    await waitFor(() => expect(enrollInProgram).toHaveBeenCalledWith('p1'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('an already-enrolled course shows Open (not Enroll), and Open and the thumbnail go to the course', () => {
    ready(program({ title: { pt: 'Modele' }, alreadyEnrolled: true }));
    renderPage();
    expect(screen.getByTestId('catalog-open')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-enroll')).toBeNull();
    fireEvent.click(screen.getByTestId('catalog-open'));
    fireEvent.click(screen.getByRole('button', { name: 'Modele' }));
    expect(navigate.mock.calls).toEqual([['/program/modele-dados-com-ia'], ['/program/modele-dados-com-ia']]);
  });

  it('shows the pending label and disables the button of the course being enrolled, only', async () => {
    enrollInProgram.mockReturnValue(new Promise(() => {}));
    ready(program(), program({ id: 'p2', slug: 'two', title: { pt: 'Dois' } }));
    renderPage();
    fireEvent.click(screen.getAllByTestId('catalog-enroll')[0]);
    await waitFor(() => expect(screen.getAllByTestId('catalog-enroll')[0]).toHaveTextContent(/Matriculando/i));
    const [first, second] = screen.getAllByTestId('catalog-enroll');
    expect(first).toHaveAttribute('aria-disabled', 'true');
    expect(second).toHaveTextContent('Matricular');
    fireEvent.click(first);
    expect(enrollInProgram).toHaveBeenCalledTimes(1);
  });

  it('shows the inline error when enrollment fails, on that course only, and a new try clears it', async () => {
    enrollInProgram.mockRejectedValueOnce(new Error('rpc')).mockReturnValue(new Promise(() => {}));
    ready(program(), program({ id: 'p2', slug: 'two', title: { pt: 'Dois' } }));
    renderPage();
    fireEvent.click(screen.getAllByTestId('catalog-enroll')[1]);
    await screen.findByTestId('catalog-enroll-error');
    expect(screen.getAllByTestId('catalog-enroll-error')).toHaveLength(1);
    expect(screen.getAllByTestId('catalog-card')[1]).toContainElement(screen.getByTestId('catalog-enroll-error'));
    expect(screen.getAllByTestId('catalog-enroll')[1]).toHaveTextContent('Matricular');
    fireEvent.click(screen.getAllByTestId('catalog-enroll')[1]);
    await waitFor(() => expect(screen.queryByTestId('catalog-enroll-error')).not.toBeInTheDocument());
  });

  it('two enrollments at once: the first stays pending while the second runs, and its failure is shown on its own card', async () => {
    let failFirst: (reason: Error) => void = () => {};
    enrollInProgram.mockImplementation((id: string) => (id === 'p1' ? new Promise((_, reject) => (failFirst = reject)) : new Promise(() => {})));
    ready(program(), program({ id: 'p2', slug: 'two', title: { pt: 'Dois' } }));
    renderPage();
    fireEvent.click(screen.getAllByTestId('catalog-enroll')[0]);
    await waitFor(() => expect(screen.getAllByTestId('catalog-enroll')[0]).toHaveTextContent(/Matriculando/i));
    fireEvent.click(screen.getAllByTestId('catalog-enroll')[1]);
    await waitFor(() => expect(screen.getAllByTestId('catalog-enroll')[1]).toHaveTextContent(/Matriculando/i));
    const [first, second] = screen.getAllByTestId('catalog-enroll');
    expect(first).toHaveTextContent(/Matriculando/i);
    expect(first).toHaveAttribute('aria-disabled', 'true');
    expect(second).toHaveAttribute('aria-disabled', 'true');
    failFirst(new Error('rpc'));
    await screen.findByTestId('catalog-enroll-error');
    expect(screen.getAllByTestId('catalog-card')[0]).toContainElement(screen.getByTestId('catalog-enroll-error'));
    expect(screen.getAllByTestId('catalog-enroll')[0]).toHaveTextContent('Matricular');
    expect(screen.getAllByTestId('catalog-enroll')[1]).toHaveTextContent(/Matriculando/i);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renders the empty state when no catalog courses', () => {
    useCatalog.mockReturnValue({ data: [], isPending: false, isError: false });
    renderPage();
    expect(screen.getByTestId('catalog-empty')).toBeInTheDocument();
  });

  it('renders the error and retry when the read failed', () => {
    const refetch = vi.fn();
    useCatalog.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  describe('a first read that cannot reach the server', () => {
    it('shows the error and a retry at once while the browser is offline', () => {
      const refetch = vi.fn();
      useCatalog.mockReturnValue({ data: undefined, isPending: true, isError: false, fetchStatus: 'paused', failureCount: 0, failureReason: null, refetch });
      renderPage();
      expect(screen.getByTestId('catalog-error')).toHaveTextContent('Não foi possível carregar o catálogo.');
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(refetch).toHaveBeenCalledOnce();
    });

    it('shows the error after the first attempt died on the network, retries still running', () => {
      useCatalog.mockReturnValue({ data: undefined, isPending: true, isError: false, fetchStatus: 'fetching', failureCount: 1, failureReason: new Error('TypeError: Failed to fetch'), refetch: vi.fn() });
      renderPage();
      expect(screen.getByTestId('catalog-error')).toBeInTheDocument();
    });

    it('keeps the shimmer while any other error is being retried', () => {
      useCatalog.mockReturnValue({ data: undefined, isPending: true, isError: false, fetchStatus: 'fetching', failureCount: 1, failureReason: new Error('boom'), refetch: vi.fn() });
      const { container } = renderPage();
      expect(screen.queryByTestId('catalog-error')).toBeNull();
      expect(container.querySelectorAll('.ds-shimmer')).toHaveLength(3);
    });
  });

  describe('visitor mode (no active subscription)', () => {
    beforeEach(() => {
      useAccessLevel.mockReturnValue({ level: 'visitor', entitlementError: false });
      ready(program());
    });

    it('shows the locked CTA instead of Enroll, and an enroll is never possible', () => {
      renderPage();
      expect(screen.getByText(/Modele seus dados com IA/i)).toBeInTheDocument();
      expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
      expect(screen.getByTestId('catalog-locked-cta')).toHaveTextContent('Assine para desbloquear');
      expect(screen.queryByTestId('catalog-enroll')).not.toBeInTheDocument();
      expect(enrollInProgram).not.toHaveBeenCalled();
    });

    it('the CTA is a link to /subscribe that the router follows, and the thumbnail opens the course', () => {
      renderPage();
      const cta = screen.getByTestId('catalog-locked-cta');
      expect(cta).toHaveAttribute('href', '/subscribe');
      fireEvent.click(cta);
      expect(navigate).toHaveBeenLastCalledWith('/subscribe');
      fireEvent.click(screen.getByRole('button', { name: 'Modele seus dados com IA' }));
      expect(navigate).toHaveBeenLastCalledWith('/program/modele-dados-com-ia');
    });

    it.each(['shell', 'pending'])('inside the shell (%s) no price, plan or sign-up wording and no link to /subscribe is drawn', (surface) => {
      useShellSurface.mockReturnValue(surface);
      const { container } = renderPage();
      expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-locked-cta')).toBeNull();
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).not.toMatch(/assin|subscri|plano|preço/i);
    });
  });
});
