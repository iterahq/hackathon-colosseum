import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { CredentialCard } from '@/components/passport/CredentialCard';
import type { CredentialVerification } from '@/types/achievements';

const TEACHER = 'CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B';
const data = (over: Partial<CredentialVerification> = {}): CredentialVerification => ({
  verified: true,
  asset: 'C5v3tjmXLL3eKGyDxA2ZaRPqG4DV1hARRPbFVdFAZ1Th',
  owner: '6xttnCLX6tHxdMjbAcCMJLJ9wJsdnZfMYTR3onNWywsR',
  frozen: true,
  collection: null,
  update_authority: null,
  attributes: [],
  achievement: { key: 'trail_pass', tier: 'bronze', title: 'Certificação', trail: 'Semana 1 · HTML', image_url: null, state: { days_done: 2, total_days: 5 }, stamps: [] },
  minted_at: '2026-10-10T03:00:00.000Z',
  ...over,
});

const renderCard = (verification: CredentialVerification) =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <CredentialCard lookup={{ status: 'verified', data: verification, ms: 120 }} />
      </I18nProvider>
    </MemoryRouter>
  );

describe('CredentialCard endorsements', () => {
  it('shows no endorsement row on a certification nobody endorsed', () => {
    renderCard(data());
    expect(screen.queryByTestId('credential-endorsement')).toBeNull();
  });

  it('lists each endorsing wallet, linked to its public profile and to the transaction', () => {
    renderCard(data({ endorsements: [{ wallet: TEACHER, at: '2026-10-10T03:13:23.771Z', explorerUrl: 'https://explorer.solana.com/tx/abc?cluster=devnet' }] }));
    const rows = screen.getAllByTestId('credential-endorsement');
    expect(rows).toHaveLength(1);
    const [profile, transaction] = Array.from(rows[0].querySelectorAll('a'));
    expect(profile.getAttribute('href')).toBe(`/u/${TEACHER}`);
    expect(profile.getAttribute('title')).toBe(TEACHER);
    expect(transaction.getAttribute('href')).toBe('https://explorer.solana.com/tx/abc?cluster=devnet');
  });
});
