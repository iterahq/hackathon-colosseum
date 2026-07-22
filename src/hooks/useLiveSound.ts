import { useCallback } from 'react';
import { useSoundEffects } from './useSoundEffects';
import { useLiveMuted } from './useLiveMuted';
import { useLiveVolume } from './useLiveVolume';

/**
 * Live-class sound cues, gated by the shared mute preference and scaled by the
 * shared volume: answer success/error, a warning in the final seconds,
 * time's-up, and advance-to-next. Reuses the app's `useSoundEffects` clips.
 */
export function useLiveSound() {
  const { play } = useSoundEffects();
  const [muted, toggleMuted] = useLiveMuted();
  const [volume] = useLiveVolume();

  const onAnswer = useCallback(
    (correct: boolean) => {
      if (muted || volume === 0) return;
      // Pass/fail is the key learner feedback — play it at a clearly audible
      // level (like the async lesson flow) instead of scaling it down into
      // near-silence at the low default music volume.
      play(correct ? 'success' : 'error', correct ? 0.4 : 0.3);
    },
    [muted, volume, play]
  );

  // The intermediate "answer sent" step (before the correct/wrong confirm).
  const onSubmit = useCallback(() => {
    if (!muted) play('submit', 0.35 * volume);
  }, [muted, volume, play]);

  const onWarn = useCallback(() => {
    if (!muted) play('click', 0.2 * volume);
  }, [muted, volume, play]);

  const onTimeUp = useCallback(() => {
    if (!muted) play('error', 0.3 * volume);
  }, [muted, volume, play]);

  const onAdvance = useCallback(() => {
    if (!muted) play('click', 0.2 * volume);
  }, [muted, volume, play]);

  return { muted, toggleMuted, onAnswer, onSubmit, onWarn, onTimeUp, onAdvance };
}
