import { describe, it, expect } from 'vitest';
import type { CatalogProgram } from '../catalog/model';
import { homeBadgesOf, homeProgramsOf, homeProgramsOfCounts, homeStatsOf, streakDaysOf, homeViewOf, orderHomePrograms, percentOf, statsViewOf, toEnrolledCardView, type HomeProgram, type HomeReads } from './model';

const make = (
  slug: string,
  createdAt: string,
  completedCount: number,
  activityCount: number
): HomeProgram => ({
  id: slug,
  tenantId: 't',
  slug,
  title: { pt: slug },
  createdAt,
  completedCount,
  activityCount,
});

describe('orderHomePrograms', () => {
  it('puts started programs first, then newest-first, finished last', () => {
    const out = orderHomePrograms([
      make('old-demo', '2026-01-01T00:00:00Z', 0, 5),
      make('done', '2026-09-01T00:00:00Z', 4, 4),
      make('new-course', '2026-09-20T00:00:00Z', 0, 30),
      make('started-old', '2026-02-01T00:00:00Z', 2, 10),
      make('mid', '2026-05-01T00:00:00Z', 0, 3),
    ]);
    expect(out.map((p) => p.slug)).toEqual([
      'started-old',
      'new-course',
      'mid',
      'old-demo',
      'done',
    ]);
  });

  it('treats a program with no activities as not started, not finished', () => {
    const out = orderHomePrograms([
      make('empty', '2026-09-01T00:00:00Z', 0, 0),
      make('done', '2026-09-02T00:00:00Z', 1, 1),
    ]);
    expect(out.map((p) => p.slug)).toEqual(['empty', 'done']);
  });

  it('does not mutate the input', () => {
    const input = [make('a', '2026-01-01T00:00:00Z', 0, 1), make('b', '2026-02-01T00:00:00Z', 0, 1)];
    orderHomePrograms(input);
    expect(input.map((p) => p.slug)).toEqual(['a', 'b']);
  });
});

const LABELS: Record<string, string> = { 'label.lesson': 'Lição', 'label.lessons': 'Lições', 'label.unit': 'Unidade', 'label.units': 'Unidades', 'label.activity': 'Atividade', 'label.activities': 'Atividades', 'program.percentComplete': '{n}% concluído' };
const t = (key: string) => LABELS[key] ?? key;
const tText = (text: Record<string, string | undefined>) => text.pt ?? '';
const idle = { isPending: false, isError: false };

const reads = (over: Partial<HomeReads> = {}): HomeReads => ({
  visitor: false,
  email: 'ana.souza@example.com',
  search: '',
  programs: { ...idle, data: [] },
  stats: { isPending: false, data: { totalXp: 120, streakDays: 0, badgeCount: 2, completedActivities: 7 } },
  badges: { isPending: false, data: [] },
  catalog: { ...idle, data: [] },
  offer: undefined,
  hint: undefined,
  t,
  tText,
  ...over,
});

describe('the rows of the backend', () => {
  it('programs: counts the tree and the learner\'s completed activities, icon by position', () => {
    const rows = [
      { id: 'p1', tenant_id: 't', slug: 'html', title_i18n: { pt: 'HTML' }, created_at: '2026-01-01', units: [{ id: 'u1', lessons: [{ id: 'l1', activities: [{ id: 'a1' }, { id: 'a2' }] }, { id: 'l2', activities: [{ id: 'a3' }] }] }] },
      { id: 'p2' },
    ];
    expect(homeProgramsOf(rows, [{ activity_id: 'a1' }, { activity_id: 'a3' }, { activity_id: 'elsewhere' }])).toEqual([
      { id: 'p1', tenantId: 't', slug: 'html', title: { pt: 'HTML' }, createdAt: '2026-01-01', unitCount: 1, lessonCount: 2, activityCount: 3, completedCount: 2, icon: 'code' },
      { id: 'p2', tenantId: '', slug: '', title: {}, createdAt: '', unitCount: 0, lessonCount: 0, activityCount: 0, completedCount: 0, icon: 'layers' },
    ]);
    expect(homeProgramsOf(null, null)).toEqual([]);
  });

  it('the counting read gives the same programs as the read by ids', () => {
    const byIds = [
      { id: 'p1', tenant_id: 't', slug: 'html', title_i18n: { pt: 'HTML' }, created_at: '2026-01-01', units: [{ id: 'u1', lessons: [{ id: 'l1', activities: [{ id: 'a1' }, { id: 'a2' }] }, { id: 'l2', activities: [{ id: 'a3' }] }] }] },
      { id: 'p2', tenant_id: 't', slug: 'css', title_i18n: { pt: 'CSS' }, created_at: '2026-01-02', units: [{ id: 'u2', lessons: [{ id: 'l3', activities: [] }] }] },
    ];
    const byCounts = [
      { id: 'p1', tenant_id: 't', slug: 'html', title_i18n: { pt: 'HTML' }, created_at: '2026-01-01', units: [{ lessons: [{ activities: [{ count: 2 }] }, { activities: [{ count: 1 }] }] }] },
      { id: 'p2', tenant_id: 't', slug: 'css', title_i18n: { pt: 'CSS' }, created_at: '2026-01-02', units: [{ lessons: [{ activities: [{ count: 0 }] }] }] },
    ];
    const inProgram = (program_id: string) => ({ activities: { lessons: { units: { program_id } } } });
    const completedByProgram = [inProgram('p1'), inProgram('p1'), inProgram('elsewhere'), { activities: null }];
    expect(homeProgramsOfCounts(byCounts, completedByProgram)).toEqual(homeProgramsOf(byIds, [{ activity_id: 'a1' }, { activity_id: 'a3' }, { activity_id: 'elsewhere' }]));
  });

  it('the counting read: an embed that arrives as a one-row list is read too, and the completed never exceed the total', () => {
    const rows = [{ id: 'p1', units: [{ lessons: [{ activities: [{ count: 1 }] }] }] }];
    const done = { activities: [{ lessons: [{ units: [{ program_id: 'p1' }] }] }] };
    expect(homeProgramsOfCounts(rows, [done, done])[0]).toMatchObject({ activityCount: 1, completedCount: 1 });
    expect(homeProgramsOfCounts(null, null)).toEqual([]);
  });

  it('the streak: days in a row with an XP event, up to today; today may still be empty, a missed day ends it', () => {
    const now = new Date(2026, 9, 7, 15, 0);
    const at = (daysAgo: number, hour = 12) => ({ amount: 1, created_at: new Date(2026, 9, 7 - daysAgo, hour).toISOString() });
    expect(streakDaysOf([at(0), at(0, 9), at(1), at(2)], now)).toBe(3);
    expect(streakDaysOf([at(1), at(2)], now)).toBe(2);
    expect(streakDaysOf([at(0), at(2), at(3)], now)).toBe(1);
    expect(streakDaysOf([at(2), at(3)], now)).toBe(0);
    expect(streakDaysOf([{ amount: 1 }, { created_at: 'not a date' }], now)).toBe(0);
    expect(streakDaysOf(null, now)).toBe(0);
  });

  it('stats: the sum of the XP, the streak, the count of medals and of completed activities', () => {
    const today = new Date(2026, 9, 7, 10, 0);
    expect(homeStatsOf([{ amount: 10, created_at: today.toISOString() }, { amount: 5 }], [], [], today)).toEqual({ totalXp: 15, streakDays: 1, badgeCount: 0, completedActivities: 0 });
    expect(homeStatsOf([{ amount: 10 }, { amount: 5 }, { amount: 'x' }], [{ badge_id: 'b1' }], [{}, {}, {}])).toEqual({ totalXp: 15, streakDays: 0, badgeCount: 1, completedActivities: 3 });
    expect(homeStatsOf(undefined, undefined, undefined)).toEqual({ totalXp: 0, streakDays: 0, badgeCount: 0, completedActivities: 0 });
  });

  it('medals: each flagged earned when the learner holds it', () => {
    expect(homeBadgesOf([{ id: 'b1', slug: 'first', title_i18n: { pt: 'Primeira' }, icon: 'star' }, { id: 'b2', slug: 'x', icon: 3 }], [{ badge_id: 'b1' }])).toEqual([
      { id: 'b1', slug: 'first', title: { pt: 'Primeira' }, icon: 'star', earned: true },
      { id: 'b2', slug: 'x', title: {}, icon: null, earned: false },
    ]);
  });
});

describe('toEnrolledCardView', () => {
  it('is the catalog card with the progress foot', () => {
    const view = toEnrolledCardView({ ...make('html', '2026-01-01', 1, 3), title: { pt: 'HTML do zero: primeira página' }, unitCount: 1, lessonCount: 2, icon: 'layers' }, { t, tText });
    expect(view).toMatchObject({ id: 'html', slug: 'html', headline: 'HTML do zero', subline: 'primeira página', icon: 'layers' });
    expect(view.counts).toEqual({ lessons: '2 lições', units: '1 unidade', activities: '3 atividades' });
    expect(view.action).toEqual({ kind: 'enrolled', percent: 33, progress: '33% concluído' });
  });

  it('a program with no activity is at 0%, never NaN', () => {
    expect(percentOf(make('empty', '', 0, 0))).toBe(0);
    expect(percentOf(make('done', '', 4, 4))).toBe(100);
  });
});

describe('statsViewOf', () => {
  it('names the learner by the e-mail, and shows a dash while the counts load', () => {
    expect(statsViewOf('ana.souza@example.com', { isPending: false, data: { totalXp: 120, streakDays: 0, badgeCount: 2, completedActivities: 7 } })).toEqual({ name: 'ana.souza', initials: 'AN', streak: '0', xp: '120', badges: '2', completed: '7' });
    expect(statsViewOf(null, { isPending: true, data: undefined })).toEqual({ name: 'Learner', initials: 'IT', streak: '–', xp: '–', badges: '–', completed: '–' });
    expect(statsViewOf(undefined, { isPending: false, data: undefined }).xp).toBe('0');
  });
});

describe('homeViewOf', () => {
  it('a member: loading, error, empty, then the ordered cards', () => {
    const member = (programs: HomeReads['programs']) => {
      const view = homeViewOf(reads({ programs }));
      return view.kind === 'member' ? view.programs : null;
    };
    expect(member({ isPending: true, isError: false, data: undefined })).toEqual({ kind: 'loading' });
    expect(member({ isPending: false, isError: true, data: undefined })).toEqual({ kind: 'error', unreachable: false });
    expect(member({ ...idle, data: [] })).toEqual({ kind: 'empty' });
    const ready = member({ ...idle, data: [make('untouched', '2026-01-01', 0, 5), make('started', '2026-01-01', 1, 5)] });
    expect(ready?.kind === 'ready' && ready.programs.map((p) => [p.slug, p.action.kind])).toEqual([['started', 'enrolled'], ['untouched', 'enrolled']]);
  });

  it('the search filters a member\'s programs by title, and a search with no match is the empty state', () => {
    const data = [make('html', '2026-01-01', 0, 5), make('css', '2026-01-02', 0, 5)];
    const found = homeViewOf(reads({ programs: { ...idle, data }, search: 'htm' }));
    expect(found.kind === 'member' && found.programs.kind === 'ready' && found.programs.programs.map((p) => p.slug)).toEqual(['html']);
    const none = homeViewOf(reads({ programs: { ...idle, data }, search: 'zzz' }));
    expect(none.kind === 'member' && none.programs).toEqual({ kind: 'empty' });
  });

  it('a member: the medals are loading, empty or listed with their titles', () => {
    const badges = (b: HomeReads['badges']) => {
      const view = homeViewOf(reads({ badges: b }));
      return view.kind === 'member' ? view.badges : null;
    };
    expect(badges({ isPending: true, data: undefined })).toEqual({ kind: 'loading' });
    expect(badges({ isPending: false, data: [] })).toEqual({ kind: 'empty' });
    expect(badges({ isPending: false, data: [{ id: 'b1', slug: 's', title: { pt: 'Primeira' }, icon: null, earned: true }, { id: 'b2', slug: 's', title: { pt: 'Outra' }, icon: null }] })).toEqual({
      kind: 'ready',
      badges: [{ id: 'b1', title: 'Primeira', earned: true }, { id: 'b2', title: 'Outra', earned: false }],
    });
  });

  it('a visitor: the catalog, every card locked, with the host\'s offer and hint when it has them', () => {
    const course: CatalogProgram = { id: 'c1', tenantId: 't', tenantSlug: 'itera', slug: 'git', title: { pt: 'Git' }, createdAt: '', unitCount: 1, lessonCount: 1, activityCount: 1, alreadyEnrolled: true };
    const offer = { label: 'x', link: { href: '/y' } };
    const view = homeViewOf(reads({ visitor: true, catalog: { ...idle, data: [course] }, offer, hint: 'h' }));
    expect(view.kind).toBe('visitor');
    expect(view.kind === 'visitor' && view.hint).toBe('h');
    expect(view.programs.kind === 'ready' && view.programs.programs.map((p) => p.action)).toEqual([{ kind: 'locked', subscribe: offer }]);
    expect(homeViewOf(reads({ visitor: true, catalog: { isPending: true, isError: false, data: undefined } })).programs).toEqual({ kind: 'loading' });
    expect(homeViewOf(reads({ visitor: true, catalog: { isPending: false, isError: true, data: undefined } })).programs).toEqual({ kind: 'error', unreachable: false });
    expect(homeViewOf(reads({ visitor: true })).programs).toEqual({ kind: 'empty' });
  });
});
