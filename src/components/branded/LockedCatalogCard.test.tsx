import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { LockedCatalogCard } from './LockedCatalogCard';
import type { CatalogProgram } from '@/types/catalog';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

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

function renderCard() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <LockedCatalogCard program={program} />
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('LockedCatalogCard', () => {
  it('shows the lock badge and the subscribe CTA linking to /subscribe', () => {
    renderCard();
    expect(screen.getByTestId('locked-catalog-card')).toBeInTheDocument();
    expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-locked-cta')).toHaveAttribute('href', '/subscribe');
    expect(screen.queryByTestId('catalog-enroll')).not.toBeInTheDocument();
  });

  it('navigates to the program page when the thumbnail is clicked', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Modele seus dados com IA/i }));
    expect(navigate).toHaveBeenCalledWith('/program/modele-dados-com-ia');
  });
});
