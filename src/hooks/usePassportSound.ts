import { useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSoundEffects } from '@/hooks/useSoundEffects';
import type { SoundName } from '@/types/sound';

/** Passport cues through the shared sound engine; silent under reduced motion. The engine itself waits for a user gesture. */
export function usePassportSound() {
  const { play } = useSoundEffects();
  const reduce = useReducedMotion();
  return useCallback(
    (sound: SoundName, volume = 0.4) => {
      if (!reduce) play(sound, volume);
    },
    [play, reduce]
  );
}
