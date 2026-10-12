import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { parsePrizeOptions, parsePrizeTera } from '@/services/bounty.service';
import type { Bounty, PrizeTera } from '@/types/bounty';
import { PrizeTeraTag, prizeLamports, prizeState } from './PrizeTera';

const WIRE = { brand: 'Acme Labs', accent: '#ff8800', base: 'tera_normal', image_url: 'https://x.supabase.co/art.svg', issued: 0, funded: true, transferable: false, asset: null, mint_lamports: 4_000_000, fee_lamports: 10_000_000, total_lamports: 14_000_000 };
const prize = (over: Partial<PrizeTera> = {}): PrizeTera => ({ ...parsePrizeTera(WIRE)!, ...over });
const bounty = (status: Bounty['status'], prizeTera: PrizeTera | null) => ({ status, prizeTera });
const show = (status: Bounty['status'], p: PrizeTera | null, link = true) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <PrizeTeraTag bounty={bounty(status, p)} link={link} />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('parsePrizeTera', () => {
  it('reads the prize of a bounty and refuses one that cannot be drawn safely', () => {
    expect(parsePrizeTera(WIRE)).toEqual({ brand: 'Acme Labs', accent: '#ff8800', base: 'tera_normal', imageUrl: 'https://x.supabase.co/art.svg', funded: true, asset: null, mintLamports: 4_000_000, feeLamports: 10_000_000, totalLamports: 14_000_000 });
    for (const bad of [null, {}, { ...WIRE, brand: '' }, { ...WIRE, accent: 'url(javascript:1)' }]) expect(parsePrizeTera(bad)).toBeNull();
    expect(parsePrizeTera({ ...WIRE, image_url: 'javascript:alert(1)' })?.imageUrl).toBeNull();
  });

  it('offers the prize in the form only when the backend says it is on and lists a base', () => {
    const options = { enabled: true, bases: [{ key: 'tera_normal', title: 'Calm Tera', image_url: 'https://x/a.webp', thumb_url: 'https://x/a_128.webp' }], mint_lamports: 4_000_000, fee_lamports: 10_000_000, total_lamports: 14_000_000, brand_min_length: 2, brand_max_length: 24, preview_url: 'https://x/preview.svg' };
    expect(parsePrizeOptions(options)).toMatchObject({ enabled: true, totalLamports: 14_000_000, brandMin: 2, brandMax: 24, previewUrl: 'https://x/preview.svg', bases: [{ key: 'tera_normal', title: 'Calm Tera', thumbUrl: 'https://x/a_128.webp' }] });
    expect(parsePrizeOptions({ ...options, enabled: false })).toBeNull();
    expect(parsePrizeOptions({ ...options, bases: [] })).toBeNull();
    expect(parsePrizeOptions(undefined)).toBeNull();
  });
});

describe('prizeState', () => {
  it('follows the bounty: offered, being issued after the payout, delivered once the asset exists', () => {
    expect(prizeState(bounty('open', null))).toBe('none');
    expect(prizeState(bounty('awaiting_funding', prize({ funded: false })))).toBe('offered');
    expect(prizeState(bounty('open', prize()))).toBe('offered');
    expect(prizeState(bounty('paid', prize()))).toBe('minting');
    expect(prizeState(bounty('paid', prize({ asset: 'TeraAsset1' })))).toBe('delivered');
  });

  it('never promises a Tera on a bounty whose reward was locked without the Tera lines', () => {
    for (const status of ['open', 'claimed', 'submitted', 'paid'] as const) expect(prizeState(bounty(status, prize({ funded: false })))).toBe('unfunded');
  });

  it('adds up the Tera lines', () => {
    expect(prizeLamports(prize())).toBe(14_000_000);
    expect(prizeLamports(prize({ totalLamports: 0 }))).toBe(14_000_000);
    expect(prizeLamports(null)).toBe(0);
  });
});

describe('PrizeTeraTag', () => {
  it('draws nothing for a bounty with no prize', () => {
    const { container } = show('open', null);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the brand, the composed art and that the Tera is bound to who gets paid', () => {
    show('open', prize());
    const tag = screen.getByTestId('prize-tera');
    expect(tag).toHaveAttribute('data-state', 'offered');
    expect(tag).toHaveTextContent('+ Tera de prêmio');
    expect(tag).toHaveTextContent('Tera Acme Labs');
    expect(tag).toHaveTextContent('vai preso à carteira de quem for pago');
    expect(tag.querySelector('img')).toHaveAttribute('src', 'https://x.supabase.co/art.svg');
  });

  it('says the prize is not funded instead of promising it', () => {
    show('open', prize({ funded: false }));
    expect(screen.getByTestId('prize-tera')).toHaveTextContent('prêmio não pago: sem Tera');
  });

  it('links to the proof once delivered, unless it sits inside another link', () => {
    const first = show('paid', prize({ asset: 'TeraAsset1' }));
    expect(screen.getByTestId('prize-tera')).toHaveAttribute('href', '/c/TeraAsset1');
    first.unmount();
    show('paid', prize({ asset: 'TeraAsset1' }), false);
    expect(screen.getByTestId('prize-tera')).not.toHaveAttribute('href');
  });
});
