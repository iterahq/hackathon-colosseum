/**
 * Who holds the screen awake, as pure state (PLAN R-8). The platform lock is one per process, so there is
 * one registry per process and one claim holder per mounted WebView (`createKeepAwakeClaims`): the page asks over the bridge (`keepAwake {on}`), and every path that ends the page or its session
 * (route change, unmount, handshake reset, WebView relaunch) calls `releaseAll`. A lock that outlives its
 * page drains the battery, so release is idempotent and never throws.
 *
 * The platform calls are injected: `app/[...path].tsx` passes `expo-keep-awake`, tests pass spies.
 * Calls to the platform run one after another, in the order they were asked.
 */
export const KEEP_AWAKE_TAG = 'itera-lesson';

export interface KeepAwakeEffects {
  activate(tag: string): Promise<unknown> | unknown;
  deactivate(tag: string): Promise<unknown> | unknown;
}

export interface KeepAwakeHolder {
  /**
   * Hold (`true`) or release (`false`). Resolves with the state asked for; rejects when the platform call it depends on fails. A call that
   * asks for the state already asked for (and still being applied) waits for that same platform call and shares its outcome.
   */
  set(on: boolean): Promise<boolean>;
  /** Release whatever is held. Idempotent; a failing platform call is swallowed and `held()` stays true so the next release retries. */
  releaseAll(): Promise<void>;
  held(): boolean;
}

export function createKeepAwakeHolder(effects: KeepAwakeEffects): KeepAwakeHolder {
  let held = false;
  let chain: Promise<unknown> = Promise.resolve();
  // The platform call that set `held`, while it is in flight: a caller asking for the same state shares its outcome, success or failure.
  let pending: Promise<boolean> | null = null;

  const enqueue = (run: () => Promise<unknown> | unknown): Promise<unknown> => {
    const next = chain.then(run);
    chain = next.catch(() => undefined);
    return next;
  };

  const set = (on: boolean): Promise<boolean> => {
    if (on === held) return pending !== null ? pending.then(() => on) : chain.then(() => on);
    held = on;
    const op: Promise<boolean> = enqueue(() => (on ? effects.activate(KEEP_AWAKE_TAG) : effects.deactivate(KEEP_AWAKE_TAG))).then(
      () => on,
      (error: unknown) => {
        if (held === on) held = !on;
        throw error;
      },
    );
    pending = op;
    const settled = () => {
      if (pending === op) pending = null;
    };
    op.then(settled, settled);
    return op;
  };

  return {
    set,
    releaseAll: () => set(false).then(() => undefined, () => undefined),
    held: () => held,
  };
}

export interface KeepAwakeClaims {
  /** The claim holder of one mounted WebView. Its release drops its own claim only; the lock ends with the last claim. */
  owner(id: string): KeepAwakeHolder;
}

/**
 * One platform lock per process, shared by every mounted WebView (a deep link can leave a hidden one beneath
 * the visible one). A hidden instance's release never drops a lock another instance still claims, and the
 * visible instance's release never leaves the lock without a claimant.
 */
export function createKeepAwakeClaims(effects: KeepAwakeEffects): KeepAwakeClaims {
  const platform = createKeepAwakeHolder(effects);
  const claims = new Set<string>();
  return {
    owner(id) {
      const set = async (on: boolean): Promise<boolean> => {
        const had = claims.has(id);
        if (on) claims.add(id);
        else claims.delete(id);
        try {
          await platform.set(claims.size > 0);
          return on;
        } catch (error) {
          // A hold whose activation failed is not held, for every caller that asked for it; a release that failed leaves the claim it dropped.
          if (!on && had) claims.add(id);
          else if (on) claims.delete(id);
          throw error;
        }
      };
      return { set, releaseAll: () => set(false).then(() => undefined, () => undefined), held: () => claims.has(id) };
    },
  };
}
