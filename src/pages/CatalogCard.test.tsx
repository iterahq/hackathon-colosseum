import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { CatalogCard } from './CatalogCard';
import type { CatalogProgram } from '@/types/catalog';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const mutateAsync = vi.fn();
const useEnroll = vi.fn();
vi.mock('@/hooks/useCatalog', () => ({ useEnroll: () => useEnroll() }));

const program: CatalogProgram = {
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
};

function renderCard(p: CatalogProgram = program) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <CatalogCard program={p} />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockReset();
  mutateAsync.mockReset();
  useEnroll.mockReturnValue({ mutateAsync, isPending: false, isError: false });
});

describe('CatalogCard', () => {
  it('shows Enroll for a not-yet-enrolled program', () => {
    renderCard();
    expect(screen.getByTestId('catalog-enroll')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-open')).not.toBeInTheDocument();
  });

  it('shows Open for an already-enrolled program, and the thumbnail opens it', () => {
    renderCard({ ...program, alreadyEnrolled: true });
    expect(screen.getByTestId('catalog-open')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('catalog-open'));
    expect(navigate).toHaveBeenCalledWith('/program/modele-dados-com-ia');
  });

  it('shows the pending label and disables the button while enrolling', () => {
    useEnroll.mockReturnValue({ mutateAsync, isPending: true, isError: false });
    renderCard();
    const button = screen.getByTestId('catalog-enroll');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/Matriculando/i);
  });

  it('shows the inline error when enrollment fails', () => {
    useEnroll.mockReturnValue({ mutateAsync, isPending: false, isError: true });
    renderCard();
    expect(screen.getByTestId('catalog-enroll-error')).toBeInTheDocument();
  });

  it('enrolls then navigates to the course on success', async () => {
    mutateAsync.mockResolvedValueOnce({ tenantId: 't', role: 'learner', enrolled: true });
    renderCard();
    fireEvent.click(screen.getByTestId('catalog-enroll'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/program/modele-dados-com-ia'));
  });
});
