/**
 * The native host of the universal profile screen: the learner's own row of `users`, read and changed with
 * the learner's token, over the same draft and the same form view as the web host (`@iterahq/shell-core`).
 * Two reads: the RPC `current_itera_user_id`, then the row by that id (the row key is not the auth uid, and
 * the select policy shows more than the caller's row). An account with no row is an empty form, as on the web.
 *
 * Narrower than the web on purpose: no icon picker (the bundled icons are SVG, which React Native does not
 * draw), no photo upload (it needs a native picker), no cast of the exercises, and no subscription section
 * (the shell sells and bills nothing: PLAN Q-3, Q-11). A stored avatar the shell cannot draw shows the
 * initials and is never overwritten: a save sends `avatar_url` only when the learner changed it here.
 *
 * Pure TypeScript: no React, no React Native. The route file reads it with `useSyncExternalStore`.
 */
import { EMPTY_PROFILE_DRAFT, profileDraftReducer, profileFormView, type ProfileDraft, type ProfileFormState } from '@iterahq/shell-core';
import type { WritableBackend } from './nativeBackend';
import { createScreenStore, failureOf, type Loaded } from './screenStore';
import { UUID } from './tokenPayload';

export interface ProfileHostState {
  /** `closed`: this build does not open the route. `signed-out`: nothing to read with. */
  readonly gate: 'open' | 'closed' | 'signed-out';
  readonly form: ProfileFormState;
  /** The account has a Learn photo the shell can draw. */
  readonly learnPhoto: boolean;
}

export interface ProfileHost {
  subscribe(listener: () => void): () => void;
  snapshot(): ProfileHostState;
  takeLearnPhoto(): void;
  /** The callbacks of the screen, under the names of its props. */
  readonly actions: { onRetry(): void; onEditName(name: string): void; onRevert(): void; onSave(): void };
}

export interface ProfileHostOptions {
  backend: WritableBackend;
  /** False where the route is not open (a release build while the row is `webview`): no read ever starts. */
  enabled: boolean;
}

export interface ProfileRow {
  /** Null: the account has no row of `users`. */
  id: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  dflAvatarUrl: string | null;
  email: string | null;
}

const NO_ROW: ProfileRow = { id: null, displayName: null, avatarUrl: null, dflAvatarUrl: null, email: null };
const CLOSED: ProfileHostState = { gate: 'closed', form: { kind: 'loading' }, learnPhoto: false };
const NO_PRESETS: readonly string[] = [];

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** A picture React Native can draw: a remote raster. The web's bundled icons are relative SVG paths. */
export const drawable = (url: string): string => (/^https:\/\//i.test(url) && !/\.svg(\?|#|$)/i.test(url) ? url : '');

export async function loadProfile(backend: WritableBackend): Promise<Loaded<ProfileRow>> {
  const who = await backend.rpc('current_itera_user_id');
  const noUser = failureOf([who]);
  if (noUser !== null) return noUser;
  if (who.kind !== 'ok') return { kind: 'error', unreachable: false };
  if (who.value === null) return { kind: 'ready', value: NO_ROW };
  if (typeof who.value !== 'string' || !UUID.test(who.value)) return { kind: 'error', unreachable: false };
  const rows = await backend.rows('users', `select=display_name,avatar_url,dfl_avatar_url,email&id=eq.${who.value}`);
  const failure = failureOf([rows]);
  if (failure !== null) return failure;
  if (rows.kind !== 'ok' || !Array.isArray(rows.value)) return { kind: 'error', unreachable: false };
  const row: unknown = rows.value[0];
  if (typeof row !== 'object' || row === null) return { kind: 'ready', value: NO_ROW };
  const r = row as Record<string, unknown>;
  return { kind: 'ready', value: { id: who.value, displayName: str(r.display_name), avatarUrl: str(r.avatar_url), dflAvatarUrl: str(r.dfl_avatar_url), email: str(r.email) } };
}

export function createProfileHost({ backend, enabled }: ProfileHostOptions): ProfileHost {
  const store = createScreenStore(() => loadProfile(backend), (listener) => backend.onSession(listener));
  let draft: ProfileDraft = EMPTY_PROFILE_DRAFT;
  let drafted: Loaded<ProfileRow> | null = null;
  let saving = false;
  let saveFailed = false;
  let shown: { from: Loaded<ProfileRow>; draft: ProfileDraft; saving: boolean; saveFailed: boolean; state: ProfileHostState } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  /** A new read (another learner, a retry) starts a new draft: nobody inherits what the last one typed. */
  const follow = (from: Loaded<ProfileRow>) => {
    if (drafted === from) return;
    drafted = from;
    saving = false;
    saveFailed = false;
    draft = from.kind === 'ready' ? profileDraftReducer(EMPTY_PROFILE_DRAFT, { type: 'hydrate', displayName: from.value.displayName, avatarUrl: from.value.avatarUrl }) : EMPTY_PROFILE_DRAFT;
  };

  const stateOf = (from: Loaded<ProfileRow>): ProfileHostState => {
    if (from.kind === 'signed-out') return { gate: 'signed-out', form: { kind: 'loading' }, learnPhoto: false };
    if (from.kind === 'loading') return { gate: 'open', form: { kind: 'loading' }, learnPhoto: false };
    if (from.kind === 'error') return { gate: 'open', form: { kind: 'error' }, learnPhoto: false };
    const view = profileFormView(draft, { email: from.value.email, presets: NO_PRESETS, saving, saveFailed, uploading: false, uploadFailed: false });
    return {
      gate: 'open',
      form: { kind: 'ready', form: { ...view, avatarUrl: drawable(view.avatarUrl), canSave: view.canSave && from.value.id !== null } },
      learnPhoto: drawable(from.value.dflAvatarUrl ?? '') !== '',
    };
  };

  const edit = (event: Parameters<typeof profileDraftReducer>[1]) => {
    const from = store.snapshot();
    follow(from);
    if (!enabled || from.kind !== 'ready') return;
    draft = profileDraftReducer(draft, event);
    notify();
  };

  const save = () => {
    const from = store.snapshot();
    follow(from);
    if (!enabled || saving || from.kind !== 'ready' || from.value.id === null) return;
    const mine = draft;
    if (!profileFormView(mine, { email: null, presets: NO_PRESETS, saving, saveFailed, uploading: false, uploadFailed: false }).canSave) return;
    const patch: Record<string, string> = { display_name: mine.name.trim() };
    if (mine.avatarUrl !== mine.savedAvatarUrl) patch.avatar_url = mine.avatarUrl;
    saving = true;
    saveFailed = false;
    notify();
    void backend.update('users', from.value.id, patch).then((answer) => {
      // The learner changed while the write was out: its answer belongs to nobody on screen.
      if (drafted !== from) return;
      saving = false;
      // Saved means the backend changed the row: an answer that changed none (a row that is gone, a policy that hid it) is a failure.
      const wrote = answer.kind === 'ok' && answer.value === 1;
      saveFailed = !wrote;
      if (wrote) draft = profileDraftReducer(draft, { type: 'saved', avatarUrl: mine.avatarUrl });
      notify();
    });
  };

  return {
    subscribe(listener) {
      if (!enabled) return () => {};
      listeners.add(listener);
      const off = store.subscribe(listener);
      return () => {
        listeners.delete(listener);
        off();
      };
    },
    snapshot() {
      if (!enabled) return CLOSED;
      const from = store.snapshot();
      follow(from);
      if (shown !== null && shown.from === from && shown.draft === draft && shown.saving === saving && shown.saveFailed === saveFailed) return shown.state;
      shown = { from, draft, saving, saveFailed, state: stateOf(from) };
      return shown.state;
    },
    takeLearnPhoto() {
      const from = store.snapshot();
      const url = from.kind === 'ready' ? drawable(from.value.dflAvatarUrl ?? '') : '';
      if (url !== '') edit({ type: 'avatar', url });
    },
    actions: { onRetry: () => store.reload(), onEditName: (value) => edit({ type: 'name', value }), onRevert: () => edit({ type: 'revert' }), onSave: save },
  };
}
