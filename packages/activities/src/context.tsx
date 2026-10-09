/**
 * `<ActivityProvider>` — the one place a host injects everything an activity
 * used to reach for (ADR-3, dependency inversion).
 *
 * Fase A wrote the SHAPE of this (`ActivityHostContext` in `./renderer.ts`);
 * Fase C is where it becomes real. Before this file existed, a renderer read
 * the Itera Player directly: `@/i18n` (24 imports), `@/auth/AuthContext`,
 * `@/api/iteraApi`, `@/services/*`. A component that still does that has been
 * relocated, not extracted — it would carry the Player's module graph into
 * whatever app installed it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY CONTEXT AND NOT PROPS
 * ─────────────────────────────────────────────────────────────────────────────
 * The alternative was threading `i18n`/`api`/`identity` down as props. It was
 * rejected for a measurable reason: the i18n port is read at SEVEN levels of
 * nesting (`ActivityRenderer` → kind → `ActivityShell`/`SubmitButton` →
 * `InstructionPanel` → `RichText` → `RichBlock` → `RichSpans`), and the
 * `Uncovered<>` assertions in `src/test/activityPublicContract.test.ts` require
 * that a kind's props stay INSIDE `ActivityRendererProps` — a `i18n` prop on
 * every kind would turn every one of those lines red, i.e. the contract itself
 * says the host context is not per-activity props. Context is also what the
 * plan drew (`<ActivityProvider i18n={…} api={…} identity={…} theme={…}>`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT FAILS OPEN INSTEAD OF THROWING
 * ─────────────────────────────────────────────────────────────────────────────
 * `useI18n()` in the app throws outside its provider. Copying that here would
 * have meant editing ~40 call sites at once — every story, every test that
 * mounts a kind directly, the author harness — in the same PR that moves the
 * files, and each of those edits is a chance to change behaviour in a PR whose
 * exit criterion is "the Player is identical".
 *
 * So a component with no provider above it gets `DEFAULT_HOST`, whose i18n is
 * the package's own dictionary. That is safe HERE and would not be safe for a
 * random context, because the fallback strings are asserted equal to the app's
 * (`src/test/activityDefaultI18n.test.ts`) — an unprovided render produces the
 * same pixels, not a plausible-looking substitute.
 *
 * The port stays REQUIRED where the contract says it is: `ActivityProviderProps.i18n`
 * has no default. Fail-open is about the absence of the provider, not about a
 * provider that forgot a port.
 */
import { createContext, createElement, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ActivityEvent, ActivityEventHandler } from './events.js';
import type {
  ActivityI18n,
  ActivityLiveBufferPort,
  ActivitySoundCue,
  ActivityStoragePort,
} from './ports.js';
import type { ActivityHostContext, ActivityProviderProps } from './renderer.js';
import { ACTIVITY_DICTIONARY, createActivityI18n } from './i18n/dictionary.js';

/** The host context used when no `<ActivityProvider>` is mounted above. */
const DEFAULT_HOST: ActivityHostContext = { i18n: createActivityI18n('pt') };

const ActivityHostCtx = createContext<ActivityHostContext | undefined>(undefined);

/**
 * Wrap the host's i18n so a key it does not know falls back to the package's
 * own string rather than rendering the key.
 *
 * PER KEY, not all-or-nothing: a host that translates ten of the twenty-four
 * keeps its ten. `t` is only replaced when it returns the key VERBATIM, which
 * is the universal "missing translation" signal (it is exactly what the
 * Player's own `t` does: `resources[locale][key] ?? resources.en[key] ?? key`).
 */
function withDictionaryFallback(i18n: ActivityI18n): ActivityI18n {
  return {
    ...i18n,
    t: (key, vars) => {
      const fromHost = i18n.t(key, vars);
      if (fromHost !== key) return fromHost;
      const fallback =
        ACTIVITY_DICTIONARY[i18n.locale]?.[key] ?? ACTIVITY_DICTIONARY.en[key];
      if (fallback === undefined) return fromHost;
      let str = fallback;
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
      return str;
    },
  };
}

/**
 * Provide the host context to every activity below.
 *
 * `i18n` is the only required member; every other port is optional and its
 * absence is the capability probe (ADR-3) — `Boolean(api?.judge)` is what
 * replaced the Player's build-time `iteraApiConfigured()` env read, which could
 * never have travelled into another app's bundle.
 */
export function ActivityProvider({ children, ...host }: ActivityProviderProps) {
  const value = useMemo<ActivityHostContext>(
    () => ({ ...host, i18n: withDictionaryFallback(host.i18n) }),
    // Spread into stable scalars so a host that builds the object inline (the
    // common case: `<ActivityProvider i18n={useI18n()} …>`) does not remount
    // the whole activity tree on every render of the host.
    // `codeEditor` and `renderers` are in the list for the same reason as the
    // rest: they are things a host can swap at runtime (a lazily-loaded editor,
    // a kind registered once a feature flag flips), and a memo that ignored
    // them would keep serving the old one with nothing to show for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      host.i18n,
      host.api,
      host.identity,
      host.theme,
      host.storage,
      host.liveBuffer,
      host.sound,
      host.onEvent,
      host.codeEditor,
      host.renderers,
    ],
  );
  return createElement(ActivityHostCtx.Provider, { value }, children);
}

/** Everything the host injected. Never throws — see the fail-open note above. */
export function useActivityHost(): ActivityHostContext {
  return useContext(ActivityHostCtx) ?? DEFAULT_HOST;
}

/** The i18n port. Replaces `useI18n()` from `@/i18n` inside the package. */
export function useActivityI18n(): ActivityI18n {
  return useActivityHost().i18n;
}

/**
 * The draft-persistence port, defaulted to `localStorage` — i.e. exactly the
 * Player's behaviour when a host injects nothing.
 *
 * Read/write/clear travel together on purpose: a host that overrode only the
 * write side would hand the learner back the wrong source on the next open.
 */
export function useActivityStorage(): ActivityStoragePort {
  const { storage } = useActivityHost();
  return useMemo<ActivityStoragePort>(
    () =>
      storage ?? {
        read: (key) => {
          try {
            return globalThis.localStorage?.getItem(key) ?? null;
          } catch {
            return null;
          }
        },
        write: (key, value) => {
          try {
            globalThis.localStorage?.setItem(key, value);
          } catch {
            /* private mode / quota — a lost draft is not worth an exception */
          }
        },
        clear: (key) => {
          try {
            globalThis.localStorage?.removeItem(key);
          } catch {
            /* see above */
          }
        },
      },
    [storage],
  );
}

/**
 * Shared and module-level so the "no live class" case is REFERENTIALLY STABLE.
 * The publish effect keeps this port in its deps; a fresh object per render
 * would re-run it on every keystroke of every unrelated re-render.
 */
const NO_LIVE_BUFFER: ActivityLiveBufferPort = { publish: () => {}, forget: () => {} };

/**
 * The projection port, defaulted to a pair of no-ops.
 *
 * No localStorage fallback here, and that asymmetry with `useActivityStorage` is
 * the point: a missing `storage` would LOSE the learner's work, so the package
 * substitutes something that works. A missing `liveBuffer` loses a projection
 * nobody is watching — inventing a durable default would give a consumer with no
 * live class a second copy of the source it never asked to keep.
 */
export function useActivityLiveBuffer(): ActivityLiveBufferPort {
  return useActivityHost().liveBuffer ?? NO_LIVE_BUFFER;
}

/**
 * The cue player of the sound port, a stable function that is a no-op when the
 * host injected none. Safe to call from any handler: it never throws.
 */
export function useActivitySound(): (cue: ActivitySoundCue) => void {
  const sound = useActivityHost().sound;
  return useCallback(
    (cue) => {
      try {
        sound?.play(cue);
      } catch {
        /* sound is feedback, never a reason to break an interaction */
      }
    },
    [sound],
  );
}

/**
 * The telemetry sink for one activity (ADR-4).
 *
 * Provider-level and per-activity handlers BOTH fire, provider first: a host
 * wiring one exporter for a whole screen should not have to thread `onEvent`
 * through every renderer, and a renderer that wants a local listener should not
 * have to displace the screen's.
 *
 * Neither handler may throw — the emit sites are on the learner's critical
 * path — so both are wrapped. A dropped event costs the event and nothing else.
 */
export function useActivityEmitter(
  activityId: string,
  kind: string,
  onEvent?: ActivityEventHandler,
): (type: string, payload?: Record<string, unknown>) => void {
  const hostOnEvent = useActivityHost().onEvent;
  return useMemo(() => {
    return (type, payload) => {
      const event = {
        type,
        activityId,
        kind,
        at: Date.now(),
        ...(payload ? { payload } : {}),
      } as ActivityEvent;
      for (const sink of [hostOnEvent, onEvent]) {
        if (!sink) continue;
        try {
          sink(event);
        } catch {
          /* telemetry never breaks the learner's click */
        }
      }
    };
  }, [activityId, kind, hostOnEvent, onEvent]);
}

/** Re-exported for hosts that want the provider's children type. */
export type { ReactNode };
