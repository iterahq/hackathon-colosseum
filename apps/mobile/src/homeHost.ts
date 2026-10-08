/**
 * The native host of the universal home screen: the dashboard read with the learner's token, shaped by the
 * same pure model the web host uses (`@iterahq/shell-core`), so the two cannot draw different dashboards.
 * The reads are the web's (`src/services/programs.service.ts`), with one difference: the backend counts the
 * activities of each lesson and names the program of each completed activity, where the web reads every
 * activity id and counts in the browser (this reader caps an answer; the web does not). Then the XP events,
 * the medals and the ones earned; plus the view `my_subscription`, which the web's gate reads before the page.
 *
 * An account with no active subscription never sees this screen, as inside the shell today: there the web's
 * gate answers `/` with its no-access screen (`RequireSubscription`, PLAN W-7), so the route sends such an
 * account back to the WebView. The visitor view of the screen (locked catalog, hint, offer) is therefore
 * never drawn natively. A read of the subscription that FAILED is the error state, never "no access".
 * As on the web, only the programs can fail the page: counts and medals that could not be read are zeros
 * and an empty collection.
 *
 * Not here: the live class blocks (the `live` slot of the screen: they follow the realtime stack of the
 * live class, a DOM zone) and the header search (`?q=`, a control of the web header).
 *
 * Pure TypeScript: no React, no React Native. The route file reads it with `useSyncExternalStore`.
 */
import { HOME_COMPLETED_BY_PROGRAM_SELECT, HOME_PROGRAMS_COUNT_SELECT, HOME_XP_SELECT, homeBadgesOf, homeProgramsOfCounts, homeStatsOf, homeViewOf, localText, type HomeBadge, type HomeProgram, type HomeStats, type HomeView, type Translate } from '@iterahq/shell-core';
import type { BackendAnswer } from './backendProbe';
import type { NativeBackend } from './nativeBackend';
import { createScreenStore, failureOf, type Loaded } from './screenStore';
import { UUID } from './tokenPayload';

export interface HomeHostState {
  /** `closed`: this build does not open the route. `signed-out`: nothing to read with. `no-access`: no active subscription. */
  readonly gate: 'open' | 'closed' | 'signed-out' | 'no-access';
  readonly view: HomeView;
}

export interface HomeHost {
  subscribe(listener: () => void): () => void;
  snapshot(): HomeHostState;
  retry(): void;
  open(slug: string): void;
  browse(): void;
}

export interface HomeHostOptions {
  backend: NativeBackend;
  t: Translate;
  locale: string;
  /** False where the route is not open (a release build while the row is `webview`): no read ever starts. */
  enabled: boolean;
  /** Opens a course. `/program/:slug` is a page of the WebView. */
  openProgram(slug: string): void;
  openCatalog(): void;
}

interface HomeData {
  /** No active subscription. */
  visitor: boolean;
  email: string | null;
  programs: HomeProgram[];
  stats: HomeStats;
  badges: HomeBadge[];
}

// The backend counts the activities (`activities(count)`): an answer with every activity id of a large tenant would pass the reader's cap.
const PROGRAMS_QUERY = `select=${HOME_PROGRAMS_COUNT_SELECT}&archived_at=is.null&order=created_at.asc`;
const rowsOf = (answer: BackendAnswer): unknown => (answer.kind === 'ok' ? answer.value : []);
const hasAccess = (subscriptions: unknown): boolean => Array.isArray(subscriptions) && subscriptions.some((row: unknown) => typeof row === 'object' && row !== null && (row as { is_active?: unknown }).is_active === true);

export async function loadHome(backend: NativeBackend): Promise<Loaded<HomeData>> {
  const [subscriptions, programs, learner, xp, userBadges, badges, email] = await Promise.all([
    backend.rows('my_subscription', 'select=is_active'),
    backend.rows('programs', PROGRAMS_QUERY),
    backend.rpc('current_itera_user_id'),
    backend.rows('xp_events', `select=${HOME_XP_SELECT.replace(/\s/g, '')}`),
    backend.rows('user_badges', 'select=badge_id'),
    backend.rows('badges', 'select=id,slug,title_i18n,icon'),
    backend.email(),
  ]);
  const failure = failureOf([subscriptions, programs]) ?? (learner.kind === 'no-session' || learner.kind === 'not-configured' ? failureOf([learner]) : null);
  if (failure !== null) return failure;
  if (subscriptions.kind !== 'ok' || programs.kind !== 'ok') return { kind: 'error', unreachable: false };
  // `progress.user_id` is the Itera user id, not the auth one, and its RLS is wider than "your own rows": the filter is the caller's.
  const userId = learner.kind === 'ok' && typeof learner.value === 'string' && UUID.test(learner.value) ? learner.value : null;
  const completed = userId === null ? [] : rowsOf(await backend.rows('progress', `select=${HOME_COMPLETED_BY_PROGRAM_SELECT}&user_id=eq.${userId}&status=eq.completed`));
  return {
    kind: 'ready',
    value: {
      visitor: !hasAccess(subscriptions.value),
      email,
      programs: homeProgramsOfCounts(programs.value, completed),
      stats: homeStatsOf(rowsOf(xp), rowsOf(userBadges), completed),
      badges: homeBadgesOf(rowsOf(badges), rowsOf(userBadges)),
    },
  };
}

export function createHomeHost({ backend, t, locale, enabled, openProgram, openCatalog }: HomeHostOptions): HomeHost {
  const store = createScreenStore(() => loadHome(backend), (listener) => backend.onSession(listener));
  const tText = (text: Parameters<typeof localText>[0]) => localText(text, locale);
  const viewOf = (data: Loaded<HomeData>): HomeView => {
    const value = data.kind === 'ready' ? data.value : undefined;
    const isPending = data.kind === 'loading';
    return homeViewOf({
      visitor: false,
      email: value?.email,
      search: '',
      programs: { isPending, isError: data.kind === 'error', data: value?.programs },
      stats: { isPending, data: value?.stats },
      badges: { isPending, data: value?.badges },
      catalog: { isPending: false, isError: false, data: undefined },
      offer: undefined,
      hint: undefined,
      t,
      tText,
    });
  };
  const gateOf = (data: Loaded<HomeData>): HomeHostState['gate'] => {
    if (data.kind === 'signed-out') return 'signed-out';
    return data.kind === 'ready' && data.value.visitor ? 'no-access' : 'open';
  };
  const CLOSED: HomeHostState = { gate: 'closed', view: viewOf({ kind: 'loading' }) };
  let shown: { from: Loaded<HomeData>; state: HomeHostState } | null = null;

  return {
    subscribe: (listener) => (enabled ? store.subscribe(listener) : () => {}),
    snapshot() {
      if (!enabled) return CLOSED;
      const from = store.snapshot();
      if (shown !== null && shown.from === from) return shown.state;
      const gate = gateOf(from);
      shown = { from, state: { gate, view: viewOf(gate === 'open' ? from : { kind: 'loading' }) } };
      return shown.state;
    },
    retry: () => store.reload(),
    open: openProgram,
    browse: openCatalog,
  };
}
