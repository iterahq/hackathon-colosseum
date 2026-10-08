import { describe, expect, it, vi } from 'vitest';
import type { BackendAnswer } from './backendProbe';
import { createHomeHost, loadHome } from './homeHost';
import { MAX_ANSWER_CHARS, createNativeBackend, type NativeBackend } from './nativeBackend';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const ok = (value: unknown): BackendAnswer => ({ kind: 'ok', value, status: 200 });
const FAILED: BackendAnswer = { kind: 'failed', status: 500 };
const LABELS: Record<string, string> = { 'label.lesson': 'Lição', 'label.lessons': 'Lições', 'label.unit': 'Unidade', 'label.units': 'Unidades', 'label.activity': 'Atividade', 'label.activities': 'Atividades', 'program.percentComplete': '{n}% concluído' };
const t = (key: string) => LABELS[key] ?? key;
const ITERA_USER = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
const tree = (activities: number) => [{ lessons: [{ activities: [{ count: activities }] }] }];
const doneIn = (program_id: string) => ({ activities: { lessons: { units: { program_id } } } });
const PROGRAMS = [
  { id: 'p1', tenant_id: 't', slug: 'html', title_i18n: { pt: 'HTML do zero: primeira página' }, created_at: '2026-01-01T00:00:00Z', units: tree(4) },
  { id: 'p2', tenant_id: 't', slug: 'css', title_i18n: { pt: 'CSS' }, created_at: '2026-02-01T00:00:00Z', units: tree(1) },
];

type Answers = Partial<Record<'my_subscription' | 'programs' | 'progress' | 'xp_events' | 'user_badges' | 'badges' | 'user', BackendAnswer>> & { email?: string | null };

function fakeBackend(answers: Answers = {}) {
  let session: ((signedIn: boolean) => void) | null = null;
  const defaults: Record<string, BackendAnswer> = {
    my_subscription: ok([{ is_active: true }]),
    programs: ok(PROGRAMS),
    progress: ok([doneIn('p1')]),
    xp_events: ok([{ amount: 10, created_at: new Date().toISOString() }, { amount: 5 }]),
    user_badges: ok([{ badge_id: 'b1' }]),
    badges: ok([{ id: 'b1', slug: 'first', title_i18n: { pt: 'Primeira lição' }, icon: null }, { id: 'b2', slug: 'x', title_i18n: { pt: 'Maratonista' }, icon: null }]),
  };
  const rows = vi.fn(async (resource: string, _query: string): Promise<BackendAnswer> => (answers as Record<string, BackendAnswer | undefined>)[resource] ?? defaults[resource] ?? FAILED);
  const rpc = vi.fn(async (): Promise<BackendAnswer> => answers.user ?? ok(ITERA_USER));
  const backend: NativeBackend = {
    rpc,
    rows,
    email: async () => (answers.email === undefined ? 'ana.souza@example.com' : answers.email),
    onSession: (listener) => {
      session = listener;
      return () => {
        session = null;
      };
    },
  };
  return { backend, rpc, rows, emit: (signedIn: boolean) => session?.(signedIn) };
}

const hostOf = (fake: ReturnType<typeof fakeBackend>, enabled = true) => {
  const openProgram = vi.fn();
  const openCatalog = vi.fn();
  return { host: createHomeHost({ backend: fake.backend, t, locale: 'pt', enabled, openProgram, openCatalog }), openProgram, openCatalog };
};

async function ready(answers: Answers = {}) {
  const fake = fakeBackend(answers);
  const made = hostOf(fake);
  made.host.subscribe(() => {});
  await tick();
  await tick();
  return { ...made, fake, state: made.host.snapshot() };
}

describe('loadHome', () => {
  it('makes the reads of the web dashboard, the progress filtered by the caller\'s Itera user id', async () => {
    const fake = fakeBackend();
    await loadHome(fake.backend);
    expect(fake.rpc.mock.calls).toEqual([['current_itera_user_id']]);
    expect(fake.rows.mock.calls).toEqual([
      ['my_subscription', 'select=is_active'],
      ['programs', 'select=id,tenant_id,slug,title_i18n,created_at,units(lessons(activities(count)))&archived_at=is.null&order=created_at.asc'],
      ['xp_events', 'select=amount,created_at'],
      ['user_badges', 'select=badge_id'],
      ['badges', 'select=id,slug,title_i18n,icon'],
      ['progress', `select=activities(lessons(units(program_id)))&user_id=eq.${ITERA_USER}&status=eq.completed`],
    ]);
  });

  it('an answer that is no uuid is never put in a query: no progress is read', async () => {
    const fake = fakeBackend({ user: ok('x&select=*') });
    const loaded = await loadHome(fake.backend);
    expect(fake.rows.mock.calls.map(([resource]) => resource)).not.toContain('progress');
    expect(loaded.kind === 'ready' && loaded.value.stats.completedActivities).toBe(0);
  });

  it('the subscription and the programs can fail the page; no session is signed out', async () => {
    expect(await loadHome(fakeBackend({ my_subscription: FAILED }).backend)).toEqual({ kind: 'error', unreachable: false });
    expect(await loadHome(fakeBackend({ programs: { kind: 'failed', status: null } }).backend)).toEqual({ kind: 'error', unreachable: true });
    expect(await loadHome(fakeBackend({ programs: { kind: 'no-session' } }).backend)).toEqual({ kind: 'signed-out' });
    expect(await loadHome(fakeBackend({ user: { kind: 'no-session' } }).backend)).toEqual({ kind: 'signed-out' });
  });
});

describe('loadHome: a large tenant', () => {
  it('12 programs of 1000 activities each are a small answer: the backend counts, the reader\'s cap is not in the way', async () => {
    const big = Array.from({ length: 12 }, (_, p) => ({ id: `p${p}`, tenant_id: 't', slug: `s${p}`, title_i18n: { pt: `Programa ${p}` }, created_at: '2026-01-01', units: Array.from({ length: 10 }, () => ({ lessons: Array.from({ length: 10 }, () => ({ activities: [{ count: 10 }] })) })) }));
    expect(JSON.stringify(big).length).toBeLessThan(MAX_ANSWER_CHARS / 10);
    const loaded = await loadHome(fakeBackend({ programs: ok(big) }).backend);
    expect(loaded.kind === 'ready' && loaded.value.programs.map((p) => p.activityCount)).toEqual(Array(12).fill(1000));
  });
});

describe('the home host over the real reader', () => {
  it('a token the page did not give in time is the error state with its retry, never a redirect to /login', async () => {
    const listeners = new Set<(event: { type: string }) => void>();
    const session = { getAccessToken: async () => null, subscribe: (l: (event: { type: string }) => void) => (listeners.add(l), () => listeners.delete(l)) };
    const backend = createNativeBackend({ origin: 'https://backend.example', anonKey: 'sb_publishable_x' }, session, vi.fn());
    listeners.forEach((l) => l({ type: 'signed-in' }));
    const host = createHomeHost({ backend, t, locale: 'pt', enabled: true, openProgram: vi.fn(), openCatalog: vi.fn() });
    host.subscribe(() => {});
    await tick();
    await tick();
    expect(host.snapshot()).toMatchObject({ gate: 'open', view: { kind: 'member', programs: { kind: 'error' } } });
    listeners.forEach((l) => l({ type: 'signed-out' }));
    expect(host.snapshot().gate).toBe('signed-out');
  });
});

describe('createHomeHost', () => {
  it('loading: the shimmer, dashes for the counts, the medals loading', () => {
    const { host } = hostOf(fakeBackend());
    host.subscribe(() => {});
    const { gate, view } = host.snapshot();
    expect(gate).toBe('open');
    expect(view).toMatchObject({ kind: 'member', programs: { kind: 'loading' }, badges: { kind: 'loading' }, stats: { xp: '–', name: 'Learner' } });
  });

  it('a member: the welcome line, the counts, the cards in order with their progress, the medals', async () => {
    const { state } = await ready();
    expect(state.gate).toBe('open');
    const view = state.view;
    if (view.kind !== 'member' || view.programs.kind !== 'ready' || view.badges.kind !== 'ready') throw new Error('not ready');
    expect(view.stats).toEqual({ name: 'ana.souza', initials: 'AN', streak: '1', xp: '15', badges: '1', completed: '1' });
    expect(view.programs.programs.map((p) => [p.headline, p.subline, p.counts.activities, p.action])).toEqual([
      ['HTML do zero', 'primeira página', '4 atividades', { kind: 'enrolled', percent: 25, progress: '25% concluído' }],
      ['CSS', null, '1 atividade', { kind: 'enrolled', percent: 0, progress: '0% concluído' }],
    ]);
    expect(view.badges.badges).toEqual([{ id: 'b1', title: 'Primeira lição', earned: true }, { id: 'b2', title: 'Maratonista', earned: false }]);
  });

  it('the snapshot is the same object until something changes', async () => {
    const { host } = await ready();
    expect(host.snapshot()).toBe(host.snapshot());
  });

  it('no program is the empty state; counts and medals that could not be read are zeros and an empty collection', async () => {
    const { state } = await ready({ programs: ok([]), xp_events: FAILED, user_badges: FAILED, badges: FAILED, progress: FAILED, email: null });
    expect(state).toMatchObject({ gate: 'open', view: { kind: 'member', programs: { kind: 'empty' }, badges: { kind: 'empty' }, stats: { name: 'Learner', initials: 'IT', xp: '0', badges: '0', completed: '0' } } });
  });

  it('an account with no active subscription is sent back to the web gate: the visitor view is never drawn', async () => {
    const { state } = await ready({ my_subscription: ok([{ is_active: false }]) });
    expect(state.gate).toBe('no-access');
    expect(state.view).toMatchObject({ kind: 'member', programs: { kind: 'loading' } });
  });

  it('error with retry, and signed out', async () => {
    const { host, fake, state } = await ready({ programs: { kind: 'failed', status: null } });
    expect(state).toMatchObject({ gate: 'open', view: { kind: 'member', programs: { kind: 'error', unreachable: false } } });
    const before = fake.rows.mock.calls.length;
    host.retry();
    expect(host.snapshot().view).toMatchObject({ programs: { kind: 'loading' } });
    expect(fake.rows.mock.calls.length).toBeGreaterThan(before);
    expect((await ready({ my_subscription: { kind: 'no-session' } })).state.gate).toBe('signed-out');
  });

  it('a sign-out while the screen is up closes it at once and drops what was read', async () => {
    const { host, fake } = await ready();
    fake.emit(false);
    const { gate, view } = host.snapshot();
    expect(gate).toBe('signed-out');
    expect(view).toMatchObject({ programs: { kind: 'loading' }, stats: { name: 'Learner' } });
  });

  it('a course and the catalog open through the host', async () => {
    const { host, openProgram, openCatalog } = await ready();
    host.open('html');
    host.browse();
    expect(openProgram).toHaveBeenCalledWith('html');
    expect(openCatalog).toHaveBeenCalledTimes(1);
  });

  it('a build that does not open the route reads nothing', async () => {
    const fake = fakeBackend();
    const { host } = hostOf(fake, false);
    host.subscribe(() => {});
    host.retry();
    await tick();
    expect(host.snapshot().gate).toBe('closed');
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.rows).not.toHaveBeenCalled();
  });
});
