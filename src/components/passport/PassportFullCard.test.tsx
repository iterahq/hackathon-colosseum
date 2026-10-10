import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { PassportFullCard } from '@/components/passport/PassportFullCard';
import type { PassportPageData } from '@/types/achievements';

const page = (over: Partial<PassportPageData>): PassportPageData =>
  ({ trailId: 't', trailTitle: 'HTML', colorIndex: 1, totalDays: 5, daysDone: 4, tier: 'bronze', locked: false, mintStatus: 'unclaimed', assetAddress: null, txSignature: null, credentialId: null, earnedAt: '2026-10-05T10:00:00Z', ...over }) as PassportPageData;

const show = (p: PassportPageData) => render(<I18nProvider><PassportFullCard page={p} /></I18nProvider>);

describe('PassportFullCard date label', () => {
  it('says "Iniciada em" until the certification is gold', () => {
    show(page({}));
    expect(screen.getByText('Iniciada em 05/10/2026')).toBeInTheDocument();
  });
  it('says "Conquistado em" for a gold one', () => {
    show(page({ daysDone: 5, tier: 'gold' }));
    expect(screen.getByText('Conquistado em 05/10/2026')).toBeInTheDocument();
  });
});
