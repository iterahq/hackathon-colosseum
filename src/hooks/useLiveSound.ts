import { useCallback } from 'react';
import { useSoundEffects } from './useSoundEffects';
import { useLiveMuted } from './useLiveMuted';

/**
 * Live-class sound cues, gated by the shared mute preference:
 * answer success/error, time's-up, and advance-to-next. Reuses the app's
 * `useSoundEffects` for the actual clips.
 */
export function useLiveSound() {
  const { playSuccess, playError, playClick } = useSoundEffects();
  const [muted, toggleMuted] = useLiveMuted();

  const onAnswer = useCallback(
    (correct: boolean) => {
      if (muted) return;
      if (correct) playSuccess();
      else playError();
    },
    [muted, playSuccess, playError]
  );

  const onTimeUp = useCallback(() => {
    if (!muted) playError();
  }, [muted, playError]);

  const onAdvance = useCallback(() => {
    if (!muted) playClick();
  }, [muted, playClick]);

  return { muted, toggleMuted, onAnswer, onTimeUp, onAdvance };
}
