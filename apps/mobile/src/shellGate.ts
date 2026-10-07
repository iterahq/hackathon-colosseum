/**
 * The launch gate (PLAN R-7, ADR-7): a read of `<webOrigin>/shell-config.json` at launch (and again, see `rereadDue`), decided by
 * pure functions. `minShellVersion` and `updateUrl` are parsed by the pinned bridge copy
 * (`parseShellConfig`, `shellGate`, the upstream `UPDATE_URL_HOSTS` check); `forceWebview` is parsed here.
 *
 * `updateUrl` is `{ ios, android }` and read here, not by the pinned copy (which only knows one Apple URL and
 * leaves the copy byte-identical): the card offers the URL of the running platform only, on its own store host.
 *
 * Fail open (and read again, `rereadDue`): no file, a non-2xx answer, a timeout, a network error, a body above `MAX_CONFIG_BYTES`, a
 * redirect to another origin or text that is not a JSON object all give "no restriction". Fail closed, by
 * design: a valid config whose `minShellVersion` is above this shell shows the update card, and so does a
 * shell whose own version is not `x.y.z` (upstream `shellGate`). A half-valid file is read half by half: a
 * bad `minShellVersion` does not drop a valid `forceWebview`, because that list only moves routes toward
 * the WebView.
 *
 * The remote config can only send a route back to the WebView (`effectiveRouteModes`). It can never make a
 * route native. The file is fetched from the app origin only; no URL inside it is ever fetched.
 *
 * Pure TypeScript with an injected fetch: no React Native import, so the tests run in plain Node.
 */
import { SHELL_CONFIG_PATH, parseShellConfig, shellGate, type ShellConfig, type ShellGate } from '@iterahq/shell-bridge';
import { originOf } from './origin';

export const CONFIG_TIMEOUT_MS = 4000;
export const MAX_CONFIG_BYTES = 16 * 1024;
export const MAX_FORCE_WEBVIEW = 64;
const ROUTE_PATH = /^(?!.*\/\/)\/[A-Za-z0-9._~:/-]*$/;

export type StorePlatform = 'ios' | 'android';

const STORE_URL: Record<StorePlatform, RegExp> = {
  ios: /^https:\/\/apps\.apple\.com\/[^\s]*$/,
  android: /^https:\/\/play\.google\.com\/store\/apps\/details(?:[/?#][^\s]*)?$/,
};

/** The store URL for the running platform from `updateUrl: { ios, android }`, or null. Exact host, https, anchored, no user info or port. */
export function storeUrlFor(platform: string, updateUrl: unknown): string | null {
  if (platform !== 'ios' && platform !== 'android') return null;
  if (typeof updateUrl !== 'object' || updateUrl === null || Array.isArray(updateUrl)) return null;
  const url = (updateUrl as Record<string, unknown>)[platform];
  return typeof url === 'string' && url.length <= 2048 && STORE_URL[platform].test(url) ? url : null;
}

export interface LaunchConfig {
  gate: ShellGate;
  /** Normalised route patterns (`/catalog`, `/program/:slug`) that the remote config sends back to the WebView. */
  forceWebview: readonly string[];
}

/** Nothing restricted: the answer for every failure to read the config. */
export const OPEN_LAUNCH: LaunchConfig = { gate: { kind: 'run' }, forceWebview: [] };

export interface ConfigResponse {
  ok: boolean;
  url?: string;
  redirected?: boolean;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}
export type FetchLike = (url: string, init: { cache: 'no-store'; signal?: AbortSignal }) => Promise<ConfigResponse>;

function normaliseRoute(value: string): string | null {
  if (value.length > 128 || !ROUTE_PATH.test(value)) return null;
  const trimmed = value.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** The `forceWebview` list: strings that are route patterns, deduplicated, at most `MAX_FORCE_WEBVIEW`. Anything else is dropped. */
export function parseForceWebview(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const routes = value.flatMap((v) => (typeof v === 'string' ? [normaliseRoute(v)] : [])).filter((v): v is string => v !== null);
  return [...new Set(routes)].slice(0, MAX_FORCE_WEBVIEW);
}

/** The two halves of a parsed config body. */
export function parseLaunchBody(json: unknown): { config: ShellConfig | null; forceWebview: readonly string[] } {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { config: null, forceWebview: [] };
  return { config: parseShellConfig(json), forceWebview: parseForceWebview((json as Record<string, unknown>).forceWebview) };
}

export function decideLaunch(shellVersion: string, json: unknown, platform = ''): LaunchConfig {
  const { config, forceWebview } = parseLaunchBody(json);
  const gate = shellGate(shellVersion, config);
  if (gate.kind === 'run') return { gate, forceWebview };
  const raw = (json as Record<string, unknown>).updateUrl;
  return { gate: { ...gate, updateUrl: storeUrlFor(platform, raw) }, forceWebview };
}

async function readBody(res: ConfigResponse, origin: string): Promise<unknown> {
  if (!res.ok) return null;
  if (typeof res.url === 'string' && res.url !== '' && originOf(res.url) !== origin) return null;
  const declared = Number(res.headers?.get('content-length') ?? 0);
  if (declared > MAX_CONFIG_BYTES) return null;
  const text = await res.text();
  if (text.length > MAX_CONFIG_BYTES) return null;
  return JSON.parse(text) as unknown;
}

/** Read and decide; null when the file could not be read (every failure). Never throws and never waits longer than `timeoutMs`. */
export async function readLaunchConfig(
  origin: string,
  shellVersion: string,
  platform = '',
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  timeoutMs = CONFIG_TIMEOUT_MS,
): Promise<LaunchConfig | null> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, timeoutMs);
  });
  const load = (async () => {
    try {
      const res = await fetchImpl(`${origin}${SHELL_CONFIG_PATH}`, { cache: 'no-store', signal: controller?.signal });
      return await readBody(res, origin);
    } catch {
      return null;
    }
  })();
  try {
    const json = await Promise.race([load, timeout]);
    return json === null ? null : decideLaunch(shellVersion, json, platform);
  } finally {
    clearTimeout(timer);
  }
}

/** `readLaunchConfig`, with every failure read as "no restriction". */
export async function loadLaunchConfig(
  origin: string,
  shellVersion: string,
  platform = '',
  fetchImpl?: FetchLike,
  timeoutMs?: number,
): Promise<LaunchConfig> {
  return (await readLaunchConfig(origin, shellVersion, platform, fetchImpl, timeoutMs)) ?? OPEN_LAUNCH;
}

/** How the last read ended: `ok` is false when the file could not be read (the decision is then the open one, or the previous read's). */
export interface ReadStatus {
  ok: boolean;
  at: number;
}

/**
 * Back in the foreground, a read that FAILED is tried again once this long has passed (offline at launch must not dodge
 * `minShellVersion` for the life of the process, and a flapping connection must not fetch on every app switch).
 */
export const REREAD_FAILED_MS = 30_000;
/**
 * A read that succeeded is repeated at most this often, on a return to the foreground: a `minShellVersion` raised while the process
 * lives is seen within half an hour, and an app switched in and out all day costs one 16 KiB request per half hour.
 */
export const REREAD_OK_MS = 30 * 60_000;

/** Whether a return to the foreground reads the file again. The update card always does (it is only left by a new read). */
export function rereadDue(kind: 'run' | 'update', status: ReadStatus | null, now: number): boolean {
  if (kind === 'update') return true;
  if (status === null) return false;
  return now - status.at >= (status.ok ? REREAD_OK_MS : REREAD_FAILED_MS);
}

/** The foreground listener of the route: only the `active` state reads again, and a pending update card (the launch in memory) always does. */
export function rereadOnForeground(appState: string, launch: LaunchConfig | null, status: ReadStatus | null, now: number): boolean {
  return appState === 'active' && rereadDue(launch?.gate.kind === 'update' ? 'update' : 'run', status, now);
}

export interface ShownLaunchContext {
  /** The route being shown changed (a new `entryPath`): a pending update card may come up now. */
  entryChanged: boolean;
  /** The page is already gone (the failure card's Retry creates the WebView again): nothing in memory is torn down by the card. */
  pageGone: boolean;
}

/**
 * Which launch config the route shows. The first read, and any change while the update card is up, apply at once. A run -> update
 * flip that arrives while a page is mounted (a re-read on a return to the foreground) is NOT applied under it: the card would
 * unmount the WebView and the learner's unsaved in-memory state with it. It waits for the next launch or the next route entry, or
 * applies at once when the page is already gone (`pageGone`). Everything else (run -> run) follows the fresh read.
 */
export function shownLaunch(shown: LaunchConfig | null, fresh: LaunchConfig | null, ctx: ShownLaunchContext): LaunchConfig | null {
  if (fresh === null) return shown;
  if (shown === null || shown.gate.kind === 'update') return fresh;
  if (fresh.gate.kind === 'update' && !ctx.entryChanged && !ctx.pageGone) return shown;
  return fresh;
}

/** "Tentar de novo" on the failure card: reads again when the last read failed (no wait: the learner asked), never when it succeeded. */
export const rereadOnRetry = (status: ReadStatus | null): boolean => status !== null && !status.ok;

export interface LaunchGate {
  /** The decision of the first read: every later call returns the same promise (kept up to date by `refresh`). */
  get(): Promise<LaunchConfig>;
  /** The decision if it has already settled, else null. */
  peek(): LaunchConfig | null;
  /** How the last read ended, or null while the first one is pending. */
  status(): ReadStatus | null;
  /**
   * Read the file again (the app came back to the foreground, or the user asked). A file that cannot be read
   * keeps the previous decision; only a file that was read replaces it, so a later neutral or missing-key
   * config lifts the update card and a failed read does not.
   */
  refresh(): Promise<LaunchConfig>;
}

export function createLaunchGate(
  origin: string,
  shellVersion: string,
  platform = '',
  fetchImpl?: FetchLike,
  timeoutMs?: number,
  now: () => number = Date.now,
): LaunchGate {
  let settled: LaunchConfig | null = null;
  let pending: Promise<LaunchConfig> | null = null;
  let refreshing: Promise<LaunchConfig> | null = null;
  let status: ReadStatus | null = null;
  // Reads are numbered when they START. A read that settles after a later one has was answered earlier and must not
  // overwrite it: a `get()` stuck on a slow network cannot undo the `refresh()` that came after it.
  let started = 0;
  let configSeq = 0;
  let statusSeq = 0;
  const read = () => {
    const n = (started += 1);
    return readLaunchConfig(origin, shellVersion, platform, fetchImpl, timeoutMs).then((config) => {
      if (n > statusSeq) {
        statusSeq = n;
        status = { ok: config !== null, at: now() };
      }
      if (config !== null && n > configSeq) {
        configSeq = n;
        settled = config;
      }
      settled ??= OPEN_LAUNCH;
      return settled;
    });
  };
  return {
    get() {
      pending ??= read();
      return pending;
    },
    peek: () => settled,
    status: () => status,
    refresh() {
      refreshing ??= read()
        .then((c) => {
          pending = Promise.resolve(c);
          return c;
        })
        .finally(() => {
          refreshing = null;
        });
      return refreshing;
    },
  };
}

export type RouteModeName = 'webview' | 'native';

/**
 * The mode of each bundled route after the remote config. Only a downgrade is accepted: a route the bundle
 * opens natively goes to the WebView when `forceWebview` names it; a route the bundle opens in the WebView
 * stays there whatever the config says, and a name that is not in the bundled map adds nothing.
 */
export function effectiveRouteModes(bundled: readonly { path: string; mode: RouteModeName }[], forceWebview: readonly string[]): Map<string, RouteModeName> {
  const forced = new Set(forceWebview);
  return new Map(bundled.map((r) => [r.path, r.mode === 'native' && forced.has(r.path) ? 'webview' : r.mode]));
}

export interface UpdateCardCopy {
  title: string;
  body: string;
  /** What the card says when it has no store button. True while the app is in no store. */
  detail: string | null;
  /** The store button label, or null: the card is complete without a button. */
  button: string | null;
  url: string | null;
  retry: string;
}

export function updateCardCopy(gate: Extract<ShellGate, { kind: 'update' }>): UpdateCardCopy {
  const url = gate.updateUrl;
  return {
    title: 'Atualize o app',
    body: `Esta versão (${gate.shellVersion}) é antiga demais para o Itera atual. Instale a versão ${gate.minShellVersion} ou mais nova.`,
    detail: url ? null : 'Uma atualização é necessária. Fale com quem te passou o app.',
    button: url ? 'Atualizar agora' : null,
    url,
    retry: 'Tentar de novo',
  };
}
