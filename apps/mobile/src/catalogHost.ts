/**
 * The native host of the universal catalog screen: the catalog read with the learner's token, shaped by
 * the same pure model the web host uses (`@iterahq/shell-core`), so the two cannot draw different cards.
 * Two reads: the RPC `catalog_programs` and the view `my_subscription`.
 *
 * An account with no active subscription never sees this screen, as inside the shell today: there the web's
 * gate answers `/catalog` with its no-access screen (`RequireSubscription`, PLAN W-7), so the route sends
 * such an account back to the WebView and no locked card, and no offer, is ever drawn natively. A read of
 * the subscription that FAILED is the error state with its retry, never "no access".
 *
 * Narrower than the web on purpose: the web also admits a tenant admin with no subscription
 * (`src/auth/accessLevel.ts`); here only `my_subscription.is_active` does. It fails closed, and staff
 * work in the browser.
 *
 * Pure TypeScript: no React, no React Native. The route file reads it with `useSyncExternalStore`.
 */
import { catalogProgramsOf, listStateOf, localText, type CatalogListState, type CatalogProgram, type EnrollStates, type Translate } from '@iterahq/shell-core';
import type { NativeBackend } from './nativeBackend';
import { createScreenStore, failureOf, type Loaded } from './screenStore';

export interface CatalogHostState {
  /** `closed`: this build does not open the route. `signed-out`: nothing to read with. `no-access`: no active subscription. */
  readonly gate: 'open' | 'closed' | 'signed-out' | 'no-access';
  readonly list: CatalogListState;
}

export interface CatalogHost {
  subscribe(listener: () => void): () => void;
  snapshot(): CatalogHostState;
  retry(): void;
  enroll(programId: string): void;
  open(slug: string): void;
}

export interface CatalogHostOptions {
  backend: NativeBackend;
  t: Translate;
  locale: string;
  /** False where the route is not open (a release build while the row is `webview`): no read ever starts. */
  enabled: boolean;
  /** Opens a course. `/program/:slug` is a page of the WebView. */
  openProgram(slug: string): void;
}

interface CatalogData {
  programs: CatalogProgram[];
  /** No active subscription. */
  visitor: boolean;
}

const CLOSED: CatalogHostState = { gate: 'closed', list: { kind: 'loading' } };

/** Any row of `my_subscription` that is active is access; no row, or none active, is a visitor. */
export const isVisitor = (subscriptions: unknown): boolean => !(Array.isArray(subscriptions) && subscriptions.some((row: unknown) => typeof row === 'object' && row !== null && (row as { is_active?: unknown }).is_active === true));

export async function loadCatalog(backend: NativeBackend): Promise<Loaded<CatalogData>> {
  const [programs, subscriptions] = await Promise.all([backend.rpc('catalog_programs'), backend.rows('my_subscription', 'select=is_active')]);
  const failure = failureOf([programs, subscriptions]);
  if (failure !== null) return failure;
  if (programs.kind !== 'ok' || subscriptions.kind !== 'ok') return { kind: 'error', unreachable: false };
  return { kind: 'ready', value: { programs: catalogProgramsOf(programs.value), visitor: isVisitor(subscriptions.value) } };
}

export function createCatalogHost({ backend, t, locale, enabled, openProgram }: CatalogHostOptions): CatalogHost {
  const store = createScreenStore(() => loadCatalog(backend), (listener) => backend.onSession(listener));
  // The enrollments this learner started on this visit, by course. `visit` names the learner and the visit: it moves on every
  // session change, on a retry and when the screen leaves, and an enrollment that answers after that touches nothing.
  let enrolling: EnrollStates = {};
  let visit = 0;
  let offSession: (() => void) | null = null;
  let shown: { from: Loaded<CatalogData>; enrolling: EnrollStates; state: CatalogHostState } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const forget = () => {
    visit += 1;
    enrolling = {};
  };

  const stateOf = (data: Loaded<CatalogData>): CatalogHostState => {
    if (data.kind === 'signed-out') return { gate: 'signed-out', list: { kind: 'loading' } };
    if (data.kind === 'ready' && data.value.visitor) return { gate: 'no-access', list: { kind: 'loading' } };
    const query = { isPending: data.kind === 'loading', isError: data.kind === 'error', unreachable: data.kind === 'error' && data.unreachable };
    const programs = data.kind === 'ready' ? data.value.programs : [];
    const list = listStateOf(query, programs, { visitor: false, offer: undefined, enrolling, t, tText: (text) => localText(text, locale) });
    return { gate: 'open', list };
  };

  return {
    subscribe(listener) {
      if (!enabled) return () => {};
      if (listeners.size === 0) offSession = backend.onSession(forget);
      listeners.add(listener);
      const off = store.subscribe(listener);
      return () => {
        listeners.delete(listener);
        off();
        if (listeners.size > 0) return;
        offSession?.();
        offSession = null;
        forget();
      };
    },
    snapshot() {
      if (!enabled) return CLOSED;
      const from = store.snapshot();
      if (shown !== null && shown.from === from && shown.enrolling === enrolling) return shown.state;
      shown = { from, enrolling, state: stateOf(from) };
      return shown.state;
    },
    retry() {
      forget();
      store.reload();
    },
    enroll(programId) {
      const data = store.snapshot();
      if (!enabled || listeners.size === 0 || data.kind !== 'ready' || data.value.visitor || enrolling[programId]?.pending) return;
      const mine = visit;
      const mark = (pending: boolean, failed: boolean) => {
        enrolling = { ...enrolling, [programId]: { pending, failed } };
        notify();
      };
      mark(true, false);
      void backend.rpc('enroll_in_program', { p_program_id: programId }).then((answer) => {
        if (visit !== mine) return;
        mark(false, answer.kind !== 'ok');
        if (answer.kind !== 'ok') return;
        store.reload(true);
        const slug = data.value.programs.find((p) => p.id === programId)?.slug;
        if (slug) openProgram(slug);
      });
    },
    open: openProgram,
  };
}
