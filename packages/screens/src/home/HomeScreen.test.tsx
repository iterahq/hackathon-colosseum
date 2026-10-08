// @vitest-environment-options { "url": "https://app.iterahq.test/" }
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { View } from 'react-native';
import { translatorOf, type CatalogCardView, type CatalogListState, type HomeBadgesState, type HomeView } from '@iterahq/shell-core';
import { CATALOG_MESSAGES } from '../catalog/messages';
import { HomeScreen, type HomeScreenProps } from './HomeScreen';
import { HOME_MESSAGES } from './messages';

const t = translatorOf({ ...CATALOG_MESSAGES.pt, ...HOME_MESSAGES.pt });
const STATS = { name: 'ana', initials: 'AN', streak: '0', xp: '120', badges: '2', completed: '7' };

const card = (n: number, action: CatalogCardView['action']): CatalogCardView => ({
  id: `p${n}`,
  slug: `course-${n}`,
  headline: `Course ${n}`,
  subline: null,
  counts: { lessons: '2 lições', units: '1 unidade', activities: '8 atividades' },
  icon: 'code',
  tone: { accent: '#7AD6CD', surface: '#003B37', edge: '#057A72' },
  action,
});

const member = (programs: CatalogListState = { kind: 'empty' }, badges: HomeBadgesState = { kind: 'empty' }): HomeView => ({ kind: 'member', stats: STATS, programs, badges });
const visitor = (programs: CatalogListState = { kind: 'empty' }, hint?: string): HomeView => ({ kind: 'visitor', programs, hint });

function setup(view: HomeView, over: Partial<HomeScreenProps> = {}) {
  const props = { t, view, onOpenProgram: vi.fn(), onBrowseCatalog: vi.fn(), onRetry: vi.fn(), ...over };
  return { ...props, ...render(<HomeScreen {...props} />) };
}

describe('HomeScreen: the page', () => {
  it('has one h1 with the accent, inside the main landmark, and the footer', () => {
    setup(member());
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Aprenda construindo projetos reais');
    expect(screen.getByRole('main')).toContainElement(h1);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Itera/by DevFellowship');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Seus programas', 'Sua coleção de conquistas']);
  });

  it('draws the header slot above the page, and with no icon host it is drawn without glyphs', () => {
    const { container } = setup(member(), { header: <View testID="app-header" /> });
    expect(container.firstElementChild?.firstElementChild).toBe(screen.getByTestId('app-header'));
    expect(container.querySelector('svg')).toBeNull();
  });

  it('asks the host for each glyph', () => {
    const icon = vi.fn(() => null);
    setup(member({ kind: 'empty' }, { kind: 'ready', badges: [{ id: 'b1', title: 'Primeira', earned: true }, { id: 'b2', title: 'Outra', earned: false }] }), { icon });
    const kinds = icon.mock.calls.map(([i]) => (i as { kind: string }).kind);
    for (const kind of ['hero', 'crown', 'streak', 'xp', 'badges', 'completed', 'browse', 'badge-check']) expect(kinds).toContain(kind);
    expect(icon).toHaveBeenCalledWith({ kind: 'badge', earned: true, index: 0 });
    expect(icon).toHaveBeenCalledWith({ kind: 'badge', earned: false, index: 1 });
  });
});

describe('HomeScreen: a member', () => {
  it('the welcome panel names the learner and shows the four counts under their labels', () => {
    setup(member());
    const panel = screen.getByTestId('stats-card');
    expect(panel).toHaveTextContent('Bem-vindo de volta, ana');
    expect(panel).toHaveTextContent('0Dias seguidos120XP total2Conquistas7Atividades');
  });

  it('the live slot sits between the hero and the programs; the aside slot is not drawn', () => {
    setup(member(), { live: <View testID="live" />, aside: <View testID="aside" /> });
    const live = screen.getByTestId('live');
    expect(screen.getByTestId('stats-card').compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(live.compareDocumentPosition(screen.getByTestId('programs-empty')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('aside')).not.toBeInTheDocument();
  });

  it('loading: three shimmering blocks', () => {
    const { container } = setup(member({ kind: 'loading' }));
    expect(container.querySelectorAll('.ds-shimmer')).toHaveLength(3);
  });

  it('error: the message and Retry', () => {
    const { onRetry } = setup(member({ kind: 'error', unreachable: false }));
    expect(screen.getByTestId('programs-error')).toHaveTextContent('Não foi possível carregar os programas.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('empty: the note, its hint and the way to the catalog', () => {
    const { onBrowseCatalog } = setup(member());
    const empty = screen.getByTestId('programs-empty');
    expect(empty).toHaveTextContent('Nenhum programa disponível ainda.');
    expect(empty).toHaveTextContent('Novos programas estão a caminho.');
    fireEvent.click(within(empty).getByRole('button', { name: 'Cursos' }));
    expect(onBrowseCatalog).toHaveBeenCalledTimes(1);
  });

  it('an enrolled card: Start with no progress line; Continue under the percent once started; the band opens it too', () => {
    const { onOpenProgram } = setup(member({ kind: 'ready', programs: [card(1, { kind: 'enrolled', percent: 0, progress: '0% concluído' }), card(2, { kind: 'enrolled', percent: 40, progress: '40% concluído' })] }));
    const [fresh, going] = screen.getAllByTestId('program-card');
    expect(within(fresh).getByTestId('program-open')).toHaveTextContent('Começar');
    expect(fresh).not.toHaveTextContent('concluído');
    expect(going).toHaveTextContent('40% concluído');
    expect(within(going).getByTestId('program-open')).toHaveTextContent('Continuar');
    fireEvent.click(within(going).getByTestId('program-open'));
    expect(onOpenProgram).toHaveBeenLastCalledWith('course-2');
    fireEvent.click(screen.getByRole('button', { name: 'Course 1' }));
    expect(onOpenProgram).toHaveBeenLastCalledWith('course-1');
    expect(screen.getByTestId('programs-grid')).toBeInTheDocument();
  });

  it('the medals: loading, none, or each with its name', () => {
    const { rerender, ...props } = setup(member({ kind: 'empty' }, { kind: 'loading' }));
    expect(screen.getByTestId('badges-loading')).toHaveTextContent('');
    rerender(<HomeScreen {...props} view={member()} />);
    expect(screen.getByTestId('badges-empty')).toHaveTextContent('Conclua atividades para ganhar conquistas.');
    rerender(<HomeScreen {...props} view={member({ kind: 'empty' }, { kind: 'ready', badges: [{ id: 'b1', title: 'Primeira', earned: true }, { id: 'b2', title: 'Outra', earned: false }] })} />);
    expect(screen.getByText('Primeira')).toHaveClass('text-foreground');
    expect(screen.getByText('Outra')).toHaveClass('text-muted-foreground');
  });
});

describe('HomeScreen: no dead control', () => {
  it('every button of a member\'s dashboard does something: there is no "Ver todas" over the medals', () => {
    setup(member({ kind: 'ready', programs: [card(1, { kind: 'enrolled', percent: 40, progress: '40% concluído' })] }));
    expect(screen.queryByText('Ver todas')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Course 1', 'Continuar']);
  });

  it('every control carries the visible focus ring: the thumbnail, Start / Continue, the way to the catalog and Retry', () => {
    const ring = 'focus-visible:outline-evergreen-hi';
    const { rerender, ...props } = setup(member({ kind: 'ready', programs: [card(1, { kind: 'enrolled', percent: 40, progress: '40% concluído' })] }));
    for (const control of screen.getAllByRole('button')) expect(control).toHaveClass(ring);
    rerender(<HomeScreen {...props} view={member()} />);
    expect(screen.getByTestId('programs-empty-browse')).toHaveClass(ring);
    rerender(<HomeScreen {...props} view={member({ kind: 'error', unreachable: false })} />);
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveClass(ring);
  });
});

describe('HomeScreen: a visitor', () => {
  it('the aside slot replaces the welcome panel; no live slot, no medals', () => {
    setup(visitor(), { live: <View testID="live" />, aside: <View testID="aside" /> });
    expect(screen.getByTestId('aside')).toBeInTheDocument();
    expect(screen.queryByTestId('stats-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Programas disponíveis']);
  });

  it('the hint is the host\'s: drawn when given, absent otherwise', () => {
    const { rerender, ...props } = setup(visitor({ kind: 'empty' }, 'the hint of the host'));
    expect(screen.getByText('the hint of the host').tagName).toBe('P');
    rerender(<HomeScreen {...props} view={visitor()} />);
    expect(screen.queryByText('the hint of the host')).not.toBeInTheDocument();
  });

  it('locked cards carry the host\'s offer, or nothing; the states use the catalog\'s words and have no catalog button', () => {
    const offer = { label: 'the offer', link: { href: '/there' } };
    const { rerender, ...props } = setup(visitor({ kind: 'ready', programs: [card(1, { kind: 'locked', subscribe: offer }), card(2, { kind: 'locked' })] }));
    expect(screen.getByTestId('programs-grid-locked')).toBeInTheDocument();
    expect(screen.getAllByTestId('program-card-lock')).toHaveLength(2);
    expect(screen.getAllByTestId('catalog-locked-cta')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'the offer' })).toHaveAttribute('href', '/there');
    rerender(<HomeScreen {...props} view={visitor()} />);
    expect(screen.getByTestId('programs-empty')).toHaveTextContent('Nenhum curso no catálogo ainda.');
    expect(screen.queryByTestId('programs-empty-browse')).not.toBeInTheDocument();
    rerender(<HomeScreen {...props} view={visitor({ kind: 'error', unreachable: false })} />);
    expect(screen.getByTestId('programs-error')).toHaveTextContent('Não foi possível carregar o catálogo.');
  });
});
