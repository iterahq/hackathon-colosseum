import { useCallback } from 'react';
import { getSoundEngine } from '@/lib/soundEngine';
import type { SoundName } from '@/types/sound';

/** React face of the shared sound engine (`src/lib/soundEngine.ts`), which owns the clips. */
export function useSoundEffects() {
  const play = useCallback((sound: SoundName, volume: number = 0.5) => {
    getSoundEngine().play(sound, volume);
  }, []);

  const playSuccess = useCallback(() => play('success', 0.4), [play]);
  const playError = useCallback(() => play('error', 0.3), [play]);
  const playClick = useCallback(() => play('click', 0.2), [play]);
  const playCelebration = useCallback(() => play('celebration', 0.5), [play]);

  return {
    play,
    playSuccess,
    playError,
    playClick,
    playCelebration,
  };
}
