import { SOUND_URLS } from '@/lib/soundClips';
import type { SoundClipStore, SoundEngineDeps, SoundName } from '@/types/sound';

/**
 * Holds each clip in the best form reached so far: fetched bytes while there is
 * no context, a decoded buffer once there is one, a preloaded media element when
 * Web Audio is missing or the decode failed. A clip is fetched and decoded once.
 */
export function createSoundClipStore(deps: Pick<SoundEngineDeps, 'fetchBytes' | 'createAudio'>, webAudio: boolean): SoundClipStore {
  const bytes = new Map<SoundName, ArrayBuffer>();
  const buffers = new Map<SoundName, AudioBuffer>();
  const elements = new Map<SoundName, HTMLAudioElement>();
  const fetching = new Map<SoundName, Promise<void>>();
  const decoding = new Map<SoundName, Promise<void>>();
  let ctx: AudioContext | null = null;
  let decodes = webAudio;

  function preloadElement(name: SoundName): void {
    if (elements.has(name)) return;
    try {
      const audio = deps.createAudio(SOUND_URLS[name]);
      audio.preload = 'auto';
      elements.set(name, audio);
    } catch {
      // No audio at all on this platform: the app stays silent.
    }
  }

  function decode(name: SoundName): Promise<void> {
    const pending = decoding.get(name);
    if (pending) return pending;
    const data = bytes.get(name);
    if (!ctx || !data || buffers.has(name)) return Promise.resolve();
    const context = ctx;
    const task = new Promise<AudioBuffer>((resolve, reject) => {
      // Safari before 14.1 only has the callback form and returns nothing.
      const result = context.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      result?.then(resolve, reject);
    })
      .then((buffer) => {
        buffers.set(name, buffer);
      })
      .catch(() => preloadElement(name))
      .finally(() => {
        bytes.delete(name);
        decoding.delete(name);
      });
    decoding.set(name, task);
    return task;
  }

  function load(name: SoundName): Promise<void> {
    if (buffers.has(name) || elements.has(name)) return Promise.resolve();
    if (!decodes) {
      preloadElement(name);
      return Promise.resolve();
    }
    if (bytes.has(name)) return decode(name);
    const pending = fetching.get(name);
    if (pending) return pending;
    const task = deps
      .fetchBytes(SOUND_URLS[name])
      .then((data) => {
        if (!decodes) return preloadElement(name);
        bytes.set(name, data);
        return decode(name);
      })
      .catch(() => undefined)
      .finally(() => {
        fetching.delete(name);
      });
    fetching.set(name, task);
    return task;
  }

  return {
    buffer: (name) => buffers.get(name),
    element: (name) => elements.get(name),
    load,
    attach(context) {
      ctx = context;
      for (const name of [...bytes.keys()]) void decode(name);
    },
    useElements() {
      decodes = false;
      for (const name of [...bytes.keys(), ...fetching.keys()]) preloadElement(name);
      bytes.clear();
    },
  };
}
