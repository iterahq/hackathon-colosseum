import { describe, expect, it } from 'vitest';
import { catalogProgramsOf, listStateOf, toCardView, type CardContext, type CatalogProgram } from './model';

const LABELS: Record<string, string> = { 'label.lesson': 'Lição', 'label.lessons': 'Lições', 'label.unit': 'Unidade', 'label.units': 'Unidades', 'label.activity': 'Atividade', 'label.activities': 'Atividades' };

const ctx = (over: Partial<CardContext> = {}): CardContext => ({
  visitor: false,
  offer: undefined,
  enrolling: {},
  t: (key) => LABELS[key] ?? key,
  tText: (text) => text.pt ?? '',
  ...over,
});

const program = (over: Partial<CatalogProgram> = {}): CatalogProgram => ({
  id: 'p1',
  tenantId: 't',
  tenantSlug: 'itera',
  slug: 'html-do-zero',
  title: { pt: 'HTML do zero: sua primeira página no ar' },
  createdAt: '',
  unitCount: 1,
  lessonCount: 2,
  activityCount: 0,
  alreadyEnrolled: false,
  icon: 'layers',
  ...over,
});

describe('toCardView', () => {
  it('splits the title, formats the counts singular-aware and picks the tone of the icon', () => {
    const view = toCardView(program(), ctx());
    expect(view).toMatchObject({ id: 'p1', slug: 'html-do-zero', headline: 'HTML do zero', subline: 'sua primeira página no ar', icon: 'layers' });
    expect(view.counts).toEqual({ lessons: '2 lições', units: '1 unidade', activities: '0 atividades' });
    expect(view.tone.accent).toBe('#7AA2E0');
  });

  it('a member: Enroll, or Open once already in', () => {
    expect(toCardView(program(), ctx()).action).toEqual({ kind: 'enroll', pending: false, failed: false });
    expect(toCardView(program({ alreadyEnrolled: true }), ctx()).action).toEqual({ kind: 'open' });
  });

  it('each program keeps its own enrollment state: two can be pending at once, and one failing does not touch the other', () => {
    const enrolling = { p1: { pending: true, failed: false }, p2: { pending: false, failed: true } };
    expect(toCardView(program(), ctx({ enrolling })).action).toEqual({ kind: 'enroll', pending: true, failed: false });
    expect(toCardView(program({ id: 'p2' }), ctx({ enrolling })).action).toEqual({ kind: 'enroll', pending: false, failed: true });
    expect(toCardView(program({ id: 'p3' }), ctx({ enrolling })).action).toEqual({ kind: 'enroll', pending: false, failed: false });
  });

  it('a visitor: locked whatever the program says, carrying the host\'s offer if it has one', () => {
    const offer = { label: 'x', link: { href: '/y' } };
    expect(toCardView(program({ alreadyEnrolled: true }), ctx({ visitor: true })).action).toEqual({ kind: 'locked', subscribe: undefined });
    expect(toCardView(program(), ctx({ visitor: true, offer })).action).toEqual({ kind: 'locked', subscribe: offer });
  });
});

describe('listStateOf', () => {
  const read = { isPending: false, isError: false, unreachable: false };

  it('pending without an error is loading', () => {
    expect(listStateOf({ ...read, isPending: true }, [], ctx())).toEqual({ kind: 'loading' });
  });

  it('an error, or a first read that could not reach the server, is the error (the shimmer never outlives it)', () => {
    expect(listStateOf({ ...read, isError: true }, [], ctx())).toEqual({ kind: 'error', unreachable: false });
    expect(listStateOf({ isPending: true, isError: false, unreachable: true }, [], ctx())).toEqual({ kind: 'error', unreachable: true });
  });

  it('no programs is empty; some are ready, in order', () => {
    expect(listStateOf(read, [], ctx())).toEqual({ kind: 'empty' });
    const state = listStateOf(read, [program(), program({ id: 'p2' })], ctx());
    expect(state.kind === 'ready' && state.programs.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('catalogProgramsOf', () => {
  it('reads the rows of the RPC, and gives each a stable icon by position', () => {
    const rows = [
      { id: 'a', tenant_id: 't', tenant_slug: 'itera', slug: 's', title_i18n: { pt: 'Um' }, created_at: '2026-01-01', unit_count: 1, lesson_count: '2', activity_count: 3, already_enrolled: true },
      { id: 'b' },
    ];
    expect(catalogProgramsOf(rows)).toEqual([
      { id: 'a', tenantId: 't', tenantSlug: 'itera', slug: 's', title: { pt: 'Um' }, createdAt: '2026-01-01', unitCount: 1, lessonCount: 2, activityCount: 3, alreadyEnrolled: true, icon: 'code' },
      { id: 'b', tenantId: '', tenantSlug: '', slug: '', title: {}, createdAt: '', unitCount: 0, lessonCount: 0, activityCount: 0, alreadyEnrolled: false, icon: 'layers' },
    ]);
  });

  it('an answer that is not a list is no program', () => {
    expect(catalogProgramsOf(null)).toEqual([]);
    expect(catalogProgramsOf({ message: 'x' })).toEqual([]);
  });
});
