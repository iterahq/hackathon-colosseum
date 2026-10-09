import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LearnerProfilePage from '@/pages/LearnerProfilePage';
import { parseProfile } from '@/services/learnerProfile.service';

const useLearnerProfile = vi.fn();
vi.mock('@/hooks/useLearnerProfile', () => ({ useLearnerProfile: (w: string, l: string) => useLearnerProfile(w, l) }));

const WALLET = 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW';
const ok = (body: object) => ({ isPending: false, isError: false, data: { status: 'ok', profile: parseProfile(body, WALLET, 'pt') } });

function show(wallet = WALLET) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[`/u/${wallet}`]}>
        <Routes>
          <Route path="/u/:wallet" element={<LearnerProfilePage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('LearnerProfilePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the companion, certifications and medals, each linking to /c/<asset>', () => {
    useLearnerProfile.mockReturnValue(
      ok({
        verified_count: 3,
        companion: { asset: 'CompAsset1111111111111111111111111111111111', verified: true, lives: 3, max_lives: 5, level: 2, image_url: 'c.svg' },
        certifications: [{ asset: 'CertAsset', verified: true, trail: 'HTML', days_done: 4, total_days: 5, tier: 'bronze', image_url: 'a.svg' }],
        medals: [{ asset: 'MedalAsset', verified: true, key: 'first_stamp', title: 'Primeiro carimbo' }],
      })
    );
    show();
    expect(screen.getByTestId('profile-companion')).toHaveAttribute('href', '/c/CompAsset1111111111111111111111111111111111');
    expect(screen.getByTestId('profile-cert')).toHaveAttribute('href', '/c/CertAsset');
    expect(screen.getByTestId('profile-medal')).toHaveAttribute('href', '/c/MedalAsset');
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
  });

  it('an unknown wallet shows the empty line, not an error', () => {
    useLearnerProfile.mockReturnValue(ok({ companion: null, certifications: [], medals: [] }));
    show();
    expect(screen.getByTestId('profile-empty')).toBeInTheDocument();
  });

  it('a malformed address never calls the backend and shows the invalid note', () => {
    useLearnerProfile.mockReturnValue({ isPending: false, isError: false, data: undefined });
    show('garbage');
    expect(useLearnerProfile).toHaveBeenCalledWith('', 'pt');
    expect(screen.getByTestId('profile-invalid')).toBeInTheDocument();
    expect(screen.queryByText('garbage')).not.toBeInTheDocument();
  });
});
