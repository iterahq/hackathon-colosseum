// @vitest-environment-options { "url": "https://app.iterahq.test/" }
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { View } from 'react-native';
import { translatorOf, type CatalogCardAction, type CatalogCardView, type CatalogListState } from '@iterahq/shell-core';
import { CatalogScreen, type CatalogScreenProps } from './CatalogScreen';
import { CATALOG_MESSAGES } from './messages';

const t = translatorOf(CATALOG_MESSAGES.pt);

const card = (n: number, action: CatalogCardAction, over: Partial<CatalogCardView> = {}): CatalogCardView => ({
  id: `p${n}`,
  slug: `course-${n}`,
  headline: `Course ${n}`,
  subline: null,
  counts: { lessons: '2 lições', units: '1 unidade', activities: '8 atividades' },
  icon: 'code',
  tone: { accent: '#7AD6CD', surface: '#003B37', edge: '#057A72' },
  action,
  ...over,
});

const ENROLL: CatalogCardAction = { kind: 'enroll', pending: false, failed: false };

function setup(state: CatalogListState, over: Partial<CatalogScreenProps> = {}) {
  const props = { t, state, onOpenProgram: vi.fn(), onEnroll: vi.fn(), onRetry: vi.fn(), ...over };
  const view = render(<CatalogScreen {...props} />);
  return { ...props, ...view };
}

describe('CatalogScreen: the page', () => {
  it('has one h1 with the last word in the accent, the eyebrow and the subtitle, inside the main landmark', () => {
    setup({ kind: 'empty' });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Catálogo de cursos');
    expect(within(h1).getByText('cursos')).toHaveClass('text-evergreen-hi');
    expect(screen.getByText('Cursos').tagName).toBe('P');
    expect(screen.getByText('Explore os cursos disponíveis e matricule-se para começar.').tagName).toBe('P');
    expect(screen.getByRole('main')).toContainElement(h1);
  });

  it('draws the header slot above the page', () => {
    const { container } = setup({ kind: 'empty' }, { header: <View testID="app-header" /> });
    expect(container.firstElementChild?.firstElementChild).toBe(screen.getByTestId('app-header'));
  });
});

describe('CatalogScreen: the list states', () => {
  it('loading: three shimmering blocks and nothing else', () => {
    const { container } = setup({ kind: 'loading' });
    expect(container.querySelectorAll('.ds-shimmer')).toHaveLength(3);
    expect(screen.getByTestId('catalog-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('catalog-error')).toBeNull();
    expect(screen.queryByTestId('catalog-grid')).toBeNull();
  });

  it('error: the message and a retry that calls onRetry once', () => {
    const { onRetry } = setup({ kind: 'error', unreachable: true });
    expect(screen.getByTestId('catalog-error')).toHaveTextContent('Não foi possível carregar o catálogo.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('empty: the title and its hint', () => {
    setup({ kind: 'empty' });
    expect(screen.getByTestId('catalog-empty')).toHaveTextContent('Nenhum curso no catálogo ainda.');
    expect(screen.getByTestId('catalog-empty')).toHaveTextContent('Novos cursos estão a caminho.');
  });

  it('ready: one card per program, in order, in the grid', () => {
    setup({ kind: 'ready', programs: [card(1, ENROLL), card(2, { kind: 'open' }), card(3, { kind: 'locked' })] });
    const cards = screen.getAllByTestId('catalog-program-card');
    expect(cards.map((c) => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual(['Course 1', 'Course 2', 'Course 3']);
    expect(screen.getByTestId('catalog-grid')).toContainElement(cards[0]);
  });
});

describe('CatalogScreen: a card', () => {
  it('shows the counts as a list, the subline as a paragraph, and the glyphs the host drew', () => {
    const icon = vi.fn(() => <View testID="glyph" />);
    setup({ kind: 'ready', programs: [card(1, ENROLL, { subline: 'a line' })] }, { icon });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['2 lições', '1 unidade', '8 atividades']);
    expect(screen.getByText('a line').tagName).toBe('P');
    expect(icon).toHaveBeenCalledWith({ kind: 'category', icon: 'code' });
    expect(icon).toHaveBeenCalledWith({ kind: 'lessons' });
  });

  it('is drawn without glyphs when the host has none', () => {
    setup({ kind: 'ready', programs: [card(1, ENROLL)] });
    expect(screen.getByTestId('catalog-enroll')).toHaveTextContent('Matricular');
  });

  it('member, not enrolled: Enroll, no Open, and the band is not a button', () => {
    const { onEnroll } = setup({ kind: 'ready', programs: [card(1, ENROLL)] });
    expect(screen.queryByTestId('catalog-open')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Course 1' })).toBeNull();
    fireEvent.click(screen.getByTestId('catalog-enroll'));
    expect(onEnroll).toHaveBeenCalledWith('p1');
  });

  it('member, enrolled: Open and the band both open the course by slug', () => {
    const { onOpenProgram } = setup({ kind: 'ready', programs: [card(1, { kind: 'open' })] });
    expect(screen.queryByTestId('catalog-enroll')).toBeNull();
    fireEvent.click(screen.getByTestId('catalog-open'));
    fireEvent.click(screen.getByRole('button', { name: 'Course 1' }));
    expect(onOpenProgram.mock.calls).toEqual([['course-1'], ['course-1']]);
  });

  it('enrolling: the pending label, disabled', () => {
    setup({ kind: 'ready', programs: [card(1, { kind: 'enroll', pending: true, failed: false })] });
    const button = screen.getByTestId('catalog-enroll');
    expect(button).toHaveTextContent('Matriculando…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('a failed enrollment shows the inline error on that card only', () => {
    setup({ kind: 'ready', programs: [card(1, { kind: 'enroll', pending: false, failed: true }), card(2, ENROLL)] });
    expect(screen.getAllByTestId('catalog-enroll-error')).toHaveLength(1);
    expect(screen.getByTestId('catalog-enroll-error')).toHaveTextContent('Não foi possível matricular. Tente de novo.');
  });

  it('locked: the lock badge, the band opens the course, and with no offer there is no call to action at all', () => {
    const { onOpenProgram } = setup({ kind: 'ready', programs: [card(1, { kind: 'locked' })] });
    expect(screen.getByTestId('program-card-lock')).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-enroll')).toBeNull();
    expect(screen.queryByTestId('catalog-locked-cta')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Course 1' }));
    expect(onOpenProgram).toHaveBeenCalledWith('course-1');
  });

  it('locked with an offer: an anchor to its href; a plain click runs the router, a modified click is the browser\'s', () => {
    const go = vi.fn();
    const offer = { label: 'Offer words', link: { href: '/somewhere', go } };
    setup({ kind: 'ready', programs: [card(1, { kind: 'locked', subscribe: offer })] });
    const link = screen.getByTestId('catalog-locked-cta');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/somewhere');
    expect(link).toHaveTextContent('Offer words');
    expect(fireEvent.click(link)).toBe(false);
    expect(go).toHaveBeenCalledOnce();
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(go).toHaveBeenCalledOnce();
  });
});

describe('CatalogScreen: keyboard focus', () => {
  it('every control carries the visible focus ring: the thumbnail, Open, Enroll, the locked offer and Retry', () => {
    const ring = 'focus-visible:outline-evergreen-hi';
    const offer = { label: 'the offer', link: { href: '/there' } };
    const { unmount } = setup({ kind: 'ready', programs: [card(1, { kind: 'open' }), card(2, ENROLL), card(3, { kind: 'locked', subscribe: offer })] });
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(controls).toHaveLength(5);
    for (const control of controls) expect(control).toHaveClass(ring, 'focus-visible:outline-2', 'focus-visible:outline-offset-2');
    unmount();
    setup({ kind: 'error', unreachable: false });
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveClass(ring);
  });
});

