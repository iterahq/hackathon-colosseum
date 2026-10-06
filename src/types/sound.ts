export type SoundName = 'success' | 'error' | 'click' | 'celebration' | 'chime' | 'submit';

export type AudioContextCtor = new () => AudioContext;

export interface SoundEventTarget {
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void, options?: EventListenerOptions): void;
}

export interface SoundEngineDeps {
  AudioContextCtor?: AudioContextCtor;
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  createAudio: (url: string) => HTMLAudioElement;
  gestureTarget?: SoundEventTarget;
  visibility?: SoundEventTarget & { visibilityState?: string };
  idle: (task: () => void) => void;
  now: () => number;
  saveData: () => boolean;
  /** `navigator.audioSession` (Safari 16.4+), read at unlock time. */
  audioSession: () => { type: string } | undefined;
}

export interface SoundEngine {
  /** Fetch (and decode, once a context exists) now. Never rejects. */
  preload(names: readonly SoundName[]): Promise<void>;
  /** `preload` at idle time, trimmed to the essential clips on a data-saver connection. */
  schedulePreload(names: readonly SoundName[]): void;
  /** Never throws. Overlapping plays are allowed. */
  play(name: SoundName, volume?: number): void;
}

export interface SoundClipStore {
  buffer(name: SoundName): AudioBuffer | undefined;
  element(name: SoundName): HTMLAudioElement | undefined;
  /** Fetch the clip and decode it when a context is attached. Never rejects. */
  load(name: SoundName): Promise<void>;
  /** Decode with this context from now on, starting with what is already fetched. */
  attach(context: AudioContext): void;
  /** Web Audio is gone: every clip becomes a preloaded media element. */
  useElements(): void;
}
