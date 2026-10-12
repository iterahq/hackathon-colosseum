import { describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LandingPage from './LandingPage';
import { EXAMPLE_CERTIFICATION, EXAMPLE_WALLET } from '@/components/landing/landingStyles';

const data = vi.hoisted(() => ({
  board: {
    isPending: false,
    isError: false,
    data: { stats: { openCount: 4, lockedSol: '0.28 SOL', paidCount: 1, paidSol: '0.005 SOL', rehearsalPaidCount: 1, outsidePaidCount: 0 }, bounties: [], readAt: '2026-10-11T14:05:00Z' },
  } as Record<string, unknown>,
  circuit: {
    isPending: false,
    isError: false,
    data: { stampsFunded: 3465, stampsIssued: 276, purchases: 29, sharePercent: 50, stampFeeLamports: 5000, asOf: '2026-10-11T14:06:00Z', shop: { minUsdCents: 20, maxUsdCents: 1000, items: 40 } },
  } as Record<string, unknown>,
  profile: {
    isPending: false,
    data: {
      status: 'ok',
      profile: {
        wallet: 'CHJBdsVLj3ZUJSRWc2EkxXFfG2nU98dUx5Gam94kGfya',
        avatar: { imageUrl: '/a.webp' },
        certifications: [{ trail: 'Week 1 · HTML', daysDone: 5, totalDays: 5, tier: 'gold', verified: true }],
        capabilities: { verifiedCount: 4, total: 28 },
        medals: [{}, {}],
      },
    },
  } as Record<string, unknown>,
}));
// The default build tells learn -> prove -> own with the paid shelf on; a test flips a flag to see the other builds.
const flags = vi.hoisted(() => ({ paidOff: false, earnStoryOff: true }));
vi.mock('@/config/focus', async (original) => ({
  ...(await original<typeof import('@/config/focus')>()),
  get FOCUS_PAID_TERAS_OFF() {
    return flags.paidOff;
  },
  get FOCUS_EARN_STORY_OFF() {
    return flags.earnStoryOff;
  },
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ signInWithSolana: vi.fn() }) }));
vi.mock('@/hooks/useBounties', () => ({ useBountyBoard: () => data.board }));
vi.mock('@/hooks/useCircuit', () => ({ useCircuit: () => data.circuit }));
const catalog = vi.hoisted(() => ({ source: 'bundled' as 'bundled' | 'live' }));
vi.mock('@/hooks/useTeraCatalog', async () => {
  const { FALLBACK_CATALOG } = await import('@/services/teraCatalog.service');
  return { useTeraCatalog: () => ({ ...FALLBACK_CATALOG, source: catalog.source }) };
});
vi.mock('@/hooks/useLearnerProfile', () => ({ useLearnerProfile: () => data.profile }));

function mount(locale: 'pt' | 'en') {
  localStorage.setItem('itera.locale', locale);
  return render(
    <I18nProvider>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

const OLD_STORY = /bount|escrow|talent board|sponsor|be found|refuse a wallet|e-mail|devfellowship|paid work/i;

describe('LandingPage', () => {
  it('states learn, prove, own with one wallet action, the lesson without a wallet and one link to a certification', () => {
    mount('en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Learn.Prove.Own.');
    expect(screen.getByTestId('landing-lede')).toHaveTextContent('Learn to code in 10 to 15 minutes a day. Each finished day is stamped on a certification in your wallet, public on Solana. Avatars are earned by studying or bought with SOL.');
    // No Phantom in this browser: the action is the link to the sign-in page, with the label of the header button.
    const wallet = screen.getAllByTestId('landing-cta-wallet');
    expect(wallet).toHaveLength(1);
    expect(wallet[0]).toHaveAttribute('href', '/login');
    expect(wallet[0]).toHaveTextContent('Connect Wallet');
    expect(screen.getByTestId('landing-signin')).toHaveTextContent('Connect Wallet');
    expect(screen.getByTestId('landing-cta-try')).toHaveAttribute('href', '/try');
    expect(screen.getByTestId('landing-cta-try')).toHaveTextContent('Try the first lesson');
    expect(screen.getByTestId('landing-cta-profile')).toHaveAttribute('href', `/c/${EXAMPLE_CERTIFICATION}`);
    expect(screen.getByTestId('landing-example')).toHaveAttribute('href', `/u/${EXAMPLE_WALLET}`);
    expect(screen.getByTestId('landing-cta-profile')).toHaveTextContent('See a real certification on chain');
    expect(screen.getByTestId('landing-hero-links').querySelectorAll('a')).toHaveLength(1);
    expect(screen.getByTestId('landing-hero')).not.toHaveTextContent(/soulbound|Metaplex|escrow|evidence hash|15 minutes of exercises/i);
    for (const gone of ['landing-cta-email', 'landing-cta-gate', 'landing-hero-talent', 'landing-hero-bounties', 'landing-hero-found', 'landing-verify', 'landing-step-link', 'landing-talent-line', 'landing-story', 'landing-foot-verify']) {
      expect(screen.queryByTestId(gone)).toBeNull();
    }
    localStorage.clear();
  });

  it('meets a visitor with nothing of the bounty story: no text and no link to it anywhere on the page', () => {
    mount('en');
    const page = screen.getByTestId('landing');
    expect(page).not.toHaveTextContent(OLD_STORY);
    const hrefs = Array.from(page.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => /bount|talent|verify|signup|devfellowship/.test(href))).toEqual([]);
    cleanup();
    mount('pt');
    expect(screen.getByTestId('landing')).not.toHaveTextContent(/miss(ão|ões)|escrow|vitrine|patrocinador|e-mail|devfellowship|trabalho pago/i);
    localStorage.clear();
  });

  it('walks the three steps and names what is next', () => {
    mount('en');
    const steps = screen.getAllByTestId('landing-step').map((step) => step.querySelector('span')?.textContent);
    expect(steps).toEqual(['01 · Learn', '02 · Prove', '03 · Own', '04 · Next']);
    const list = screen.getByTestId('landing-steps');
    expect(list).toHaveTextContent('10 to 15 minutes of hands-on exercises');
    expect(list).toHaveTextContent('Anyone can verify it, without Itera.');
    expect(list).toHaveTextContent('Every stamped day opens a chest with an avatar. The others are bought in one tap, with the SOL already in your wallet.');
    expect(list).toHaveTextContent('Web3 on Solana trails');
    localStorage.clear();
  });

  it('reads live only the numbers of this story, each with its honest qualifier', () => {
    mount('en');
    const stats = screen.getAllByTestId('landing-stat').map((s) => s.textContent);
    expect(stats).toEqual(['276stamps written on chainnetwork fee paid by Itera', "29shop purchaseson devnet, the team's test runs included"]);
    expect(screen.getByTestId('landing-live')).toHaveTextContent("Solana devnet · the team's own test runs included");
    expect(screen.getByTestId('landing-live-readat')).toHaveTextContent(/^Read at [^.]*\.$/);
    expect(screen.getByTestId('landing-live')).not.toHaveTextContent(/never go down|capacity|left out/);
    expect(screen.getByTestId('landing-example')).toHaveTextContent('Week 1 · HTML · 5/5 days · gold');
    expect(screen.getByTestId('landing-example')).toHaveTextContent('4 of 28 capabilities verified on chain');
    expect(screen.getByTestId('landing-example')).not.toHaveTextContent(/medal/);
    expect(screen.getByTestId('landing-example')).toHaveTextContent('Verified on chain');
    localStorage.clear();
  });

  it('tells a stranger who pays and who built it, with no invented number and no community link', () => {
    mount('en');
    expect(screen.getByTestId('landing-model')).toHaveTextContent('Learning is free. Today the shop sells avatars for SOL. Next: paid micro-certifications and a talent bank for companies.');
    expect(screen.getByTestId('landing-model')).not.toHaveTextContent(/Stripe|subscription|lives|Sponsors/);
    expect(screen.queryByTestId('landing-model-build')).toBeNull();
    expect(screen.getByTestId('landing')).toHaveTextContent('Everything runs on Solana devnet. Nothing here has real value.');
    const team = screen.getByTestId('landing-team-member').textContent ?? '';
    expect(team).toBe('Built by Samuel Stefano (builder of Itera) and Tainan Fidelis (tech lead).');
    expect(screen.getByTestId('landing-team').querySelector('a')).toBeNull();
    expect(screen.getByTestId('landing-team')).not.toHaveTextContent(/\d+ (students|learners|followers|years)/);
    expect(screen.queryByTestId('landing-pitch-video')).toBeNull();
    localStorage.clear();
  });

  it('says the rare tiers are earn-only once the catalog answers, and nothing about buying while the paid shelf is off', () => {
    mount('en');
    expect(screen.getByTestId('landing-steps')).not.toHaveTextContent('earn-only');
    cleanup();
    catalog.source = 'live';
    mount('en');
    expect(screen.getByTestId('landing-steps')).toHaveTextContent('with the SOL already in your wallet. The rare tiers are earn-only.');
    cleanup();
    flags.paidOff = true;
    mount('en');
    expect(screen.getByTestId('landing-steps')).toHaveTextContent('Every stamped day opens a chest with an avatar. It lives in your wallet.');
    expect(screen.getByTestId('landing-steps')).not.toHaveTextContent(/bought|earn-only/);
    expect(screen.getByTestId('landing-model')).not.toHaveTextContent(/shop sells/);
    expect(screen.queryByTestId('landing-purchases-hint')).toBeNull();
    expect(screen.getAllByTestId('landing-stat')).toHaveLength(1);
    flags.paidOff = false;
    catalog.source = 'bundled';
    localStorage.clear();
  });

  it('keeps the bounty story behind the flag: a build that turns it on shows its steps, links and numbers again', () => {
    flags.earnStoryOff = false;
    mount('en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Learn.Prove.Earn.');
    expect(screen.getByTestId('landing-step-link')).toHaveAttribute('href', '/talent');
    expect(screen.getByTestId('landing-cta-gate')).toHaveAttribute('href', '/verify#gate');
    expect(screen.getByTestId('landing-hero-bounties')).toHaveAttribute('href', '/bounties');
    expect(screen.getByTestId('landing-verify')).toHaveAttribute('href', '/verify');
    expect(screen.getByTestId('landing-talent-line').querySelector('a')).toHaveAttribute('href', '/talent');
    expect(screen.getAllByTestId('landing-stat').map((s) => s.textContent).slice(0, 3)).toEqual(['4open bounties', '0.28 SOLin escrow', '1bounty paid0 to outside learners · 1 team rehearsal']);
    expect(screen.getByTestId('landing-story')).toBeInTheDocument();
    flags.earnStoryOff = true;
    localStorage.clear();
  });

  it('speaks Portuguese when the locale is pt', () => {
    mount('pt');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Aprenda.Prove.É seu.');
    expect(screen.getByTestId('landing-cta-wallet')).toHaveTextContent('Conectar carteira');
    expect(screen.getByTestId('landing-cta-try')).toHaveTextContent('Experimentar a primeira lição');
    localStorage.clear();
  });

  it('shows no number when a read fails and hides the example when the profile is missing', () => {
    data.board = { isPending: false, isError: true, data: undefined };
    data.circuit = { isPending: false, isError: true, data: undefined };
    data.profile = { isPending: false, data: { status: 'invalid' } };
    mount('en');
    expect(screen.queryAllByTestId('landing-stat')).toHaveLength(0);
    expect(screen.queryByTestId('landing-example')).toBeNull();
    expect(screen.getByText('No reading right now.')).toBeInTheDocument();
    localStorage.clear();
  });
});
