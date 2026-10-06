/**
 * The one sound engine of the app: Web Audio, clips fetched ahead of time and
 * decoded once, a fresh source node per play.
 *
 * It replaces an `HTMLAudioElement` created at the first `play()`, which paid
 * the download and the decode at the verdict (0.9–1.0 s on a slow connection)
 * and, on iOS, goes through a media pipeline that is slow to start.
 *
 * The context is created on the first user gesture, never before: iOS and
 * Safari only start a context from a gesture, and Chrome warns about one
 * created earlier. Until then the store holds the fetched bytes.
 *
 * The iPhone ring/silent switch mutes a context but not a media element, and the
 * clips were audible on silent before this engine. So the audio session is set
 * to `playback` at unlock (Safari 16.4+, the app's floor). An iOS engine without
 * that API is silent under the switch: a media element there measured 410 ms
 * late. The lesson's own mute button stays the only in-app switch.
 */
import { ESSENTIAL_SOUNDS, LATE_PLAY_BUDGET_MS, SILENT_SWITCH_PROOF_SESSION_TYPE } from '@/lib/soundClips';
import { createSoundClipStore } from '@/lib/soundClipStore';
import { browserSoundDeps } from '@/lib/soundEnvironment';
import type { SoundEngine, SoundEngineDeps, SoundName } from '@/types/sound';

// `pointerdown` activates audio for a mouse, `pointerup`/`touchend` for a finger.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;

const clamp = (volume: number) => Math.min(1, Math.max(0, volume));

export function createSoundEngine(deps: SoundEngineDeps): SoundEngine {
  let webAudio = !!deps.AudioContextCtor;
  const store = createSoundClipStore(deps, webAudio);
  let ctx: AudioContext | null = null;
  let armed = false;

  const running = () => ctx?.state === 'running';

  function disarm(): void {
    if (!armed) return;
    armed = false;
    for (const type of GESTURES) deps.gestureTarget?.removeEventListener(type, unlock, { capture: true });
  }

  function arm(): void {
    if (armed || !webAudio || !deps.gestureTarget) return;
    armed = true;
    for (const type of GESTURES) deps.gestureTarget.addEventListener(type, unlock, { capture: true, passive: true });
  }

  function ensureContext(): AudioContext | null {
    if (ctx || !deps.AudioContextCtor || !webAudio) return ctx;
    try {
      ctx = new deps.AudioContextCtor();
      // iOS moves the context to `interrupted` on a call or when the page is
      // backgrounded, and only a new gesture brings it back.
      ctx.addEventListener('statechange', () => (running() ? disarm() : arm()));
      store.attach(ctx);
    } catch {
      webAudio = false;
      disarm();
      store.useElements();
    }
    return ctx;
  }

  function resume(): Promise<void> {
    if (!ctx || running()) return Promise.resolve();
    try {
      return Promise.resolve(ctx.resume()).catch(() => undefined);
    } catch {
      return Promise.resolve();
    }
  }

  function claimSession(): void {
    try {
      const session = deps.audioSession();
      if (session && session.type !== SILENT_SWITCH_PROOF_SESSION_TYPE) session.type = SILENT_SWITCH_PROOF_SESSION_TYPE;
    } catch {
      // An engine that refuses the type keeps its default; nothing else depends on it.
    }
  }

  function unlock(): void {
    claimSession();
    const context = ensureContext();
    if (!context) return;
    void resume().then(() => {
      if (running()) disarm();
    });
    try {
      // A one-sample silent buffer started inside the gesture is what lets iOS
      // play later sounds that do not come from a gesture.
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, 22050);
      source.connect(context.destination);
      source.start(0);
    } catch {
      // The resume above is enough everywhere but old iOS.
    }
    if (running()) disarm();
  }

  function start(buffer: AudioBuffer, volume: number): void {
    if (!ctx) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = clamp(volume);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(0);
  }

  function playElement(name: SoundName, volume: number): boolean {
    const audio = store.element(name);
    if (!audio) return false;
    audio.volume = clamp(volume);
    audio.currentTime = 0;
    void audio.play()?.catch(() => undefined);
    return true;
  }

  function play(name: SoundName, volume = 0.5): void {
    try {
      if (playElement(name, volume)) return;
      if (!webAudio) {
        void store.load(name);
        return;
      }
      ensureContext();
      const ready = store.buffer(name);
      if (ready && running()) {
        start(ready, volume);
        return;
      }
      // A source started on a suspended context is queued and would sound when
      // the context resumes, long after the event. So: wait, then start only if
      // everything became ready in time.
      const askedAt = deps.now();
      void Promise.all([resume(), ready ? undefined : store.load(name)])
        .then(() => {
          if (deps.now() - askedAt > LATE_PLAY_BUDGET_MS) return;
          const buffer = store.buffer(name);
          if (buffer && running()) start(buffer, volume);
          else if (!buffer) playElement(name, volume);
        })
        .catch(() => undefined);
    } catch {
      // Sound is feedback, never a reason to break the screen.
    }
  }

  function preload(names: readonly SoundName[]): Promise<void> {
    try {
      return Promise.all(names.map((name) => store.load(name))).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      return Promise.resolve();
    }
  }

  function schedulePreload(names: readonly SoundName[]): void {
    try {
      const wanted = deps.saveData() ? names.filter((name) => ESSENTIAL_SOUNDS.includes(name)) : names;
      deps.idle(() => void preload(wanted));
    } catch {
      // Nothing to preload with: `play` still tries on demand.
    }
  }

  try {
    arm();
    deps.visibility?.addEventListener('visibilitychange', () => {
      if (deps.visibility?.visibilityState !== 'visible' || !ctx || running()) return;
      arm();
      void resume();
    });
  } catch {
    // Without the listeners the next `play` still tries to resume the context.
  }

  return { preload, schedulePreload, play };
}

let shared: SoundEngine | null = null;

export function getSoundEngine(): SoundEngine {
  shared ??= createSoundEngine(browserSoundDeps());
  return shared;
}
