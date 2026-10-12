import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { toTeraOrigin } from '@/services/teraOrigin';
import type { ProfileAvatarNft } from '@/types/learnerProfile';
import { OriginBadge, OriginGlyph } from './OriginBadge';
import { ProfileTeras, hasOrigins } from './ProfileTeras';
import { TeraOriginPanel } from './TeraOriginPanel';

// These tests describe both builds: `story.off` false is the build that tells the bounty story, true is the focus build.
const story = vi.hoisted(() => ({ off: false }));
vi.mock('@/config/focus', async (original) => ({
  ...(await original<typeof import('@/config/focus')>()),
  get FOCUS_EARN_STORY_OFF() {
    return story.off;
  },
}));

const tera = (key: string, wire: Record<string, unknown> | null): ProfileAvatarNft => ({ key, title: key, tierName: 'Super Tera', serial: 1, verified: true, imageUrl: '/a.webp', explorerUrl: null, rarity: 'rare', asset: `${key}Asset`, origin: wire ? toTeraOrigin({ ...wire, asset: `${key}Asset` }) : null });
const EARNED = { origin: 'earned', transferable: false, earned: { certification: 'Cert1', trail: 'Week 1 · HTML', day: 2, tier: 'rare', chest_id: 'chest-1' } };
const BOUGHT = { origin: 'bought', transferable: true };
const SPONSOR = { origin: 'sponsor', transferable: false, sponsor: { brand: 'Acme', accent: '#ff8800', bounty_slug: 'fix-nav', bounty_title: 'Fix the nav', payout_tx: 'sig1' } };

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  );

describe('ProfileTeras', () => {
  it('draws nothing while no Tera says how it was obtained', () => {
    const items = [tera('old', null)];
    expect(hasOrigins(items)).toBe(false);
    const { container } = wrap(<ProfileTeras items={items} headingClass="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps earned, sponsored and bought in three groups, in that order', () => {
    wrap(<ProfileTeras items={[tera('b', BOUGHT), tera('s', SPONSOR), tera('e', EARNED)]} headingClass="" />);
    const groups = [...screen.getByTestId('profile-teras').querySelectorAll('[data-testid^="profile-teras-"]')].map((g) => g.getAttribute('data-testid'));
    expect(groups).toEqual(['profile-teras-earned', 'profile-teras-sponsor', 'profile-teras-bought']);
    for (const [group, key] of [['earned', 'e'], ['sponsor', 's'], ['bought', 'b']]) {
      const cards = within(screen.getByTestId(`profile-teras-${group}`)).getAllByTestId('profile-tera');
      expect(cards.map((c) => c.getAttribute('data-item'))).toEqual([key]);
    }
  });

  it('an earned Tera says the trail and day, that it is bound, and links to its proof and to the roll', () => {
    wrap(<ProfileTeras items={[tera('e', EARNED)]} headingClass="" />);
    const card = screen.getByTestId('profile-tera');
    expect(within(card).getByTestId('profile-tera-day')).toHaveTextContent('Week 1 · HTML · dia 2');
    expect(within(card).getByTestId('tera-origin')).toHaveAttribute('data-transferable', 'false');
    expect(card).toHaveTextContent('Ganho');
    expect(card).toHaveTextContent('preso à carteira');
    expect(within(card).getByTestId('profile-tera-proof')).toHaveAttribute('href', '/c/eAsset');
    expect(within(card).getByTestId('profile-tera-reroll')).toHaveAttribute('href', '/verify?chest=chest-1#chest');
  });

  it('focus build: the proof link stays, the roll on /verify and the bounty link go', () => {
    story.off = true;
    wrap(<ProfileTeras items={[tera('e', EARNED), tera('s', SPONSOR)]} headingClass="" />);
    expect(screen.getAllByTestId('profile-tera-proof').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('profile-tera-reroll')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-tera-bounty')).not.toBeInTheDocument();
    story.off = false;
  });

  it('a sponsored Tera names the brand and the bounty; a bought one says it can be transferred', () => {
    wrap(<ProfileTeras items={[tera('s', SPONSOR), tera('b', BOUGHT)]} headingClass="" />);
    const sponsor = within(screen.getByTestId('profile-teras-sponsor')).getByTestId('profile-tera');
    expect(sponsor).toHaveTextContent('Patrocinado · Acme');
    expect(sponsor).toHaveTextContent('Fix the nav');
    expect(within(sponsor).getByTestId('profile-tera-bounty')).toHaveAttribute('href', '/bounties/fix-nav');
    const bought = within(screen.getByTestId('profile-teras-bought')).getByTestId('profile-tera');
    expect(bought).toHaveTextContent('Comprado');
    expect(bought).toHaveTextContent('transferível');
    expect(within(bought).queryByTestId('profile-tera-reroll')).not.toBeInTheDocument();
  });
});

describe('the three origins never look alike', () => {
  it('each kind has its own word and its own mark', () => {
    const kinds = [EARNED, BOUGHT, SPONSOR].map((wire) => toTeraOrigin(wire)!);
    const { container } = wrap(<>{kinds.map((o) => <OriginBadge key={o.kind} origin={o} />)}{kinds.map((o) => <OriginGlyph key={o.kind} origin={o} />)}</>);
    const chips = [...container.querySelectorAll('[data-testid="tera-origin"]')].map((el) => el.firstElementChild!);
    expect(new Set(chips.map((c) => c.textContent)).size).toBe(3);
    expect(new Set(chips.map((c) => c.className)).size).toBe(3);
    expect(screen.getAllByTestId('tera-origin-glyph').map((g) => g.getAttribute('aria-label'))).toEqual(['Ganho', 'Comprado', 'Patrocinado']);
  });
});

describe('TeraOriginPanel', () => {
  it('earned: the day and trail, bound to the wallet, the roll and the certification behind it', () => {
    wrap(<TeraOriginPanel origin={toTeraOrigin(EARNED)!} />);
    const panel = screen.getByTestId('tera-origin-panel');
    expect(panel).toHaveTextContent('Ganho no baú do dia 2 de Week 1 · HTML');
    expect(panel).toHaveTextContent('não pode ser vendido nem transferido');
    expect(screen.getByTestId('tera-origin-reroll')).toHaveAttribute('href', '/verify?chest=chest-1#chest');
    expect(screen.getByTestId('tera-origin-cert')).toHaveAttribute('href', '/c/Cert1');
  });

  it('bought: a collectible that can change hands, with no claim of study', () => {
    wrap(<TeraOriginPanel origin={toTeraOrigin(BOUGHT)!} />);
    const panel = screen.getByTestId('tera-origin-panel');
    expect(panel).toHaveTextContent('pode ser transferido ou revendido');
    expect(panel).not.toHaveTextContent('Preso à carteira');
  });

  it('sponsor: the bounty and the brand that paid it', () => {
    wrap(<TeraOriginPanel origin={toTeraOrigin(SPONSOR)!} />);
    expect(screen.getByTestId('tera-origin-panel')).toHaveTextContent('Prêmio da missão "Fix the nav", pago por Acme.');
    expect(screen.getByTestId('tera-origin-bounty')).toHaveAttribute('href', '/bounties/fix-nav');
  });
});
