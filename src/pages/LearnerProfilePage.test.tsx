import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LearnerProfilePage from '@/pages/LearnerProfilePage';
import { parseProfile } from '@/services/learnerProfile.service';

const useLearnerProfile = vi.fn();
vi.mock('@/hooks/useLearnerProfile', () => ({ useLearnerProfile: (w: string, l: string) => useLearnerProfile(w, l), useWalletGraph: () => ({ data: undefined }), useRecheckProfile: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/components/graph/CapabilityGraphSection', () => ({
  CapabilityGraphSection: ({ wallet, capabilities, selected, onSelect }: { wallet: string; capabilities: { source?: string }; selected?: string | null; onSelect?: (id: string | null) => void }) => (
    <div data-testid="capability-section" data-wallet={wallet} data-source={capabilities.source ?? 'chain'} data-selected={selected ?? ''}>
      <button type="button" data-testid="open-node" onClick={() => onSelect?.('html-tags')}>open</button>
    </div>
  ),
}));
// The gift block reads the session and the shop: it has its own test.
const storyWallet = { value: null as string | null };
vi.mock('@/hooks/useProgressStory', () => ({ useProgressStory: () => ({ daysDone: 0, daysStamped: 0, daysPending: 0, daysTotal: 0, verified: null, capabilitiesTotal: null, wallet: storyWallet.value, pending: false }) }));
vi.mock('@/components/talent/TalentOptIn', () => ({ TalentOptIn: () => <div data-testid="talent-optin" /> }));
vi.mock('@/components/privacy/ProfileVisibilityCard', () => ({ ProfileVisibilityCard: () => <div data-testid="privacy-card" /> }));
vi.mock('@/components/gift/ProfileGift', () => ({ ProfileGift: ({ wallet }: { wallet: string }) => <div data-testid="profile-gift" data-wallet={wallet} /> }));

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
  beforeEach(() => {
    vi.clearAllMocks();
    storyWallet.value = null;
  });

  it('offers a visitor a paid mission for this wallet, and the owner their talent card instead', () => {
    useLearnerProfile.mockReturnValue(ok({ verified_count: 1, companion: null, certifications: [{ asset: 'C', trail: 'HTML', days_done: 5, total_days: 5 }], medals: [] }));
    const visitor = show();
    expect(screen.getByTestId('profile-mission-cta')).toHaveAttribute('href', `/bounties/post?to=${WALLET}`);
    expect(screen.getByTestId('profile-mission-cta')).toHaveTextContent('Enviar uma missão paga');
    expect(screen.queryByTestId('talent-optin')).toBeNull();
    expect(screen.queryByTestId('privacy-card')).toBeNull();
    visitor.unmount();
    storyWallet.value = WALLET;
    show();
    expect(screen.queryByTestId('profile-mission')).toBeNull();
    expect(screen.getByTestId('talent-optin')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-card')).toBeInTheDocument();
  });

  it('a private profile read by a stranger: one calm line and nothing we aggregate', () => {
    useLearnerProfile.mockReturnValue({ isPending: false, isError: false, data: { status: 'private', wallet: WALLET } });
    show();
    const line = screen.getByTestId('profile-private');
    expect(line).toHaveTextContent('Este aluno mantém o perfil privado.');
    expect(line).toHaveTextContent('Uma certificação dele continua podendo ser conferida pelo link da própria certificação.');
    for (const id of ['profile-band', 'capability-section', 'profile-teras', 'profile-avatars', 'profile-certs', 'profile-mission', 'talent-optin', 'privacy-card', 'profile-invalid']) expect(screen.queryByTestId(id), id).toBeNull();
    expect(screen.getByTestId('profile-page')).not.toHaveTextContent('CQzi');
  });

  it('the owner of a private profile sees the whole page, the switch, and no link to copy', () => {
    storyWallet.value = WALLET;
    useLearnerProfile.mockReturnValue(ok({ private: true, viewer: 'owner', verified_count: 1, companion: null, certifications: [{ asset: 'C', trail: 'HTML', days_done: 5, total_days: 5 }], medals: [] }));
    show();
    expect(screen.getByTestId('profile-band')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-card')).toBeInTheDocument();
    expect(screen.getByTestId('profile-share-private')).toHaveTextContent('Seu perfil está privado: o link mostra uma linha só.');
    expect(screen.queryByRole('button', { name: 'Copiar link' })).toBeNull();
  });

  it('lists the certifications linking to /c/<asset>; the companion and the medals stay off the public profile on the focus build', () => {
    useLearnerProfile.mockReturnValue(
      ok({
        verified_count: 3,
        companion: { asset: 'CompAsset1111111111111111111111111111111111', verified: true, lives: 3, max_lives: 5, level: 2, image_url: 'c.svg' },
        certifications: [{ asset: 'CertAsset', verified: true, trail: 'HTML', days_done: 4, total_days: 5, tier: 'bronze', image_url: 'a.svg' }],
        medals: [{ asset: 'MedalAsset', verified: true, key: 'first_stamp', title: 'Primeiro carimbo' }],
      })
    );
    show();
    expect(screen.queryByTestId('profile-companion')).toBeNull();
    expect(screen.getByTestId('profile-cert')).toHaveAttribute('href', '/c/CertAsset');
    expect(screen.queryByTestId('profile-medal')).toBeNull();
    expect(screen.queryByTestId('profile-gift')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
  });

  it('shows the certification tier and never the companion line on the focus build', () => {
    useLearnerProfile.mockReturnValue(
      ok({ verified_count: 1, companion: { asset: 'CompAsset1111111111111111111111111111111111', lives: 3, mirrored_at: '2026-10-10T12:30:00Z' }, certifications: [{ asset: 'C', trail: 'HTML', days_done: 5, total_days: 5, tier: 'gold' }], medals: [] })
    );
    const { unmount } = show();
    expect(screen.queryByTestId('snapshot-line')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-cert')).toHaveTextContent('ouro');
    expect(screen.getByTestId('profile-cta')).toHaveAttribute('href', '/');
    unmount();
    useLearnerProfile.mockReturnValue(ok({ verified_count: 1, companion: null, certifications: [{ asset: 'C', trail: 'HTML', days_done: 5, total_days: 5 }], medals: [] }));
    show();
    expect(screen.queryByTestId('profile-no-companion')).toBeNull();
    expect(screen.queryByTestId('snapshot-line')).not.toBeInTheDocument();
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

  it('keeps a node opened while the profile was loading open once it has loaded', () => {
    useLearnerProfile.mockReturnValue({ isPending: true, isError: false, data: undefined, refetch: vi.fn() });
    const view = show();
    fireEvent.click(screen.getByTestId('open-node'));
    expect(screen.getByTestId('capability-section')).toHaveAttribute('data-selected', 'html-tags');
    useLearnerProfile.mockReturnValue(ok({ verified_count: 1, companion: null, certifications: [{ asset: 'C', trail: 'HTML', days_done: 5, total_days: 5 }], medals: [] }));
    view.rerender(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/u/${WALLET}`]}>
          <Routes>
            <Route path="/u/:wallet" element={<LearnerProfilePage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId('profile-band')).toBeInTheDocument();
    expect(screen.getByTestId('capability-section')).toHaveAttribute('data-selected', 'html-tags');
  });

  it('draws the graph from the shipped model while the profile is still loading', () => {
    useLearnerProfile.mockReturnValue({ isPending: true, isError: false, data: undefined, refetch: vi.fn() });
    const wallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/u/${wallet}`]}>
          <Routes>
            <Route path="/u/:wallet" element={<LearnerProfilePage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByTestId('profile-band-loading')).toBeInTheDocument();
    expect(screen.getByTestId('capability-section')).toHaveAttribute('data-source', 'static');
  });
  it('counts the proven capabilities per evidence tier beside the verified line, and shows none without a share', () => {
    const proof = (graded: string | null) => ({ asset: 'AS', attribute: 'claim:x', evidence_hash: 'ab'.padEnd(64, '0'), graded });
    const nodes = [
      { id: 'a', title: 'A', status: 'verified', proof: proof('10/12') },
      { id: 'b', title: 'B', status: 'verified', proof: proof('10/12') },
      { id: 'c', title: 'C', status: 'recorded', proof: proof(null) },
      { id: 'd', title: 'D', status: 'open' },
    ];
    useLearnerProfile.mockReturnValue(ok({ verified_count: 1, companion: null, certifications: [{ asset: 'C', trail: 'HTML', days_done: 5, total_days: 5 }], medals: [], capabilities: { nodes } }));
    const tiered = show();
    const counts = Object.fromEntries(within(screen.getByTestId('profile-tiers')).getAllByRole('listitem').map((chip) => [chip.getAttribute('data-tier'), chip.getAttribute('data-count')]));
    expect(counts).toEqual({ top: '0', middle: '2', base: '1' });
    tiered.unmount();
    useLearnerProfile.mockReturnValue(ok({ verified_count: 1, companion: null, certifications: [{ asset: 'C', trail: 'HTML', days_done: 5, total_days: 5 }], medals: [] }));
    show();
    expect(screen.queryByTestId('profile-tiers')).toBeNull();
  });
});
