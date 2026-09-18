import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { CatalogProgramCard } from './CatalogProgramCard';
import { toneFor } from './catalogCardPalette';

/**
 * The shared v3 catalog card — layout only. The Enroll/Open/Subscribe
 * behaviour lives in the callers (`CatalogCard.test.tsx`,
 * `LockedCatalogCard.test.tsx`); this file locks the title split, the
 * category color and the locked-variant lock badge.
 */
function renderCard(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('CatalogProgramCard', () => {
  it('splits "Headline: subline" into two layers', () => {
    renderCard(
      <CatalogProgramCard
        program={{ id: 'p1', title: { en: 'Model your data: with AI' }, icon: 'cpu' }}
        action={<button data-testid="cta">Enroll</button>}
      />
    );
    expect(screen.getByText('Model your data')).toBeInTheDocument();
    expect(screen.getByText('with AI')).toBeInTheDocument();
  });

  it('renders a title with no subline as a single headline', () => {
    renderCard(
      <CatalogProgramCard
        program={{ id: 'p1', title: { en: 'Frontend Fundamentals' }, icon: 'code' }}
        action={<button data-testid="cta">Enroll</button>}
      />
    );
    expect(screen.getByText('Frontend Fundamentals')).toBeInTheDocument();
  });

  it('colors the title in the category accent from PALETTE_V3', () => {
    renderCard(
      <CatalogProgramCard
        program={{ id: 'p1', title: { en: 'Prompt Evaluation' }, icon: 'rocket' }}
        action={<button data-testid="cta">Enroll</button>}
      />
    );
    const headline = screen.getByText('Prompt Evaluation');
    expect(headline).toHaveStyle({ color: toneFor('rocket').accent });
  });

  it('shows the lock badge only when locked', () => {
    const { rerender } = renderCard(
      <CatalogProgramCard
        program={{ id: 'p1', title: { en: 'X' } }}
        action={<button data-testid="cta">Subscribe</button>}
      />
    );
    expect(screen.queryByTestId('program-card-lock')).not.toBeInTheDocument();

    rerender(
      <I18nProvider>
        <CatalogProgramCard
          program={{ id: 'p1', title: { en: 'X' } }}
          action={<button data-testid="cta">Subscribe</button>}
          locked
        />
      </I18nProvider>
    );
    expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
  });

  it('makes the thumbnail a button that fires onOpenThumbnail when given', () => {
    const onOpenThumbnail = vi.fn();
    renderCard(
      <CatalogProgramCard
        program={{ id: 'p1', title: { en: 'X' } }}
        action={<button data-testid="cta">Open</button>}
        onOpenThumbnail={onOpenThumbnail}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'X' }));
    expect(onOpenThumbnail).toHaveBeenCalledTimes(1);
  });
});
