import type { AudioContextCtor, SoundEngineDeps } from '@/types/sound';

interface SoundNavigator {
  connection?: { saveData?: boolean };
  audioSession?: { type: string };
}

type AudioWindow = Partial<Window> & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };

/** The browser as the sound engine sees it; every piece is optional so jsdom and SSR stay silent. */
export function browserSoundDeps(): SoundEngineDeps {
  const scope: AudioWindow = typeof window === 'undefined' ? {} : (window as AudioWindow);
  const nav = (typeof navigator === 'undefined' ? undefined : navigator) as SoundNavigator | undefined;
  return {
    AudioContextCtor: scope.AudioContext ?? scope.webkitAudioContext,
    fetchBytes: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`sound ${response.status}`);
      return response.arrayBuffer();
    },
    createAudio: (url) => new Audio(url),
    gestureTarget: typeof window === 'undefined' ? undefined : window,
    visibility: typeof document === 'undefined' ? undefined : document,
    idle: (task) => {
      // Low priority on purpose: the clips must not compete with the first paint.
      if (typeof scope.requestIdleCallback === 'function') scope.requestIdleCallback(() => task(), { timeout: 3000 });
      else setTimeout(task, 300);
    },
    now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
    saveData: () => nav?.connection?.saveData === true,
    audioSession: () => nav?.audioSession,
  };
}
