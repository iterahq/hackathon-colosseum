import type { ActivitySoundCue, ActivitySoundPort } from '@iterahq/activities';
import { getSoundEngine } from '@/lib/soundEngine';
import { isLessonMuted } from '@/hooks/useLessonMuted';
import type { SoundName } from '@/types/sound';

/** Fixed clip and volume per cue; quieter than the verdict clips on purpose. */
export const ACTIVITY_CUES: Record<ActivitySoundCue, { clip: SoundName; volume: number }> = {
  pick: { clip: 'click', volume: 0.15 },
  connect: { clip: 'submit', volume: 0.25 },
  drop: { clip: 'click', volume: 0.25 },
  correct: { clip: 'success', volume: 0.4 },
  wrong: { clip: 'error', volume: 0.3 },
  complete: { clip: 'chime', volume: 0.3 },
};

interface Deps {
  play: (clip: SoundName, volume: number) => void;
  active: () => boolean;
  muted: () => boolean;
}

export function createActivitySoundPort(deps: Deps): ActivitySoundPort {
  return {
    play(cue) {
      const entry = ACTIVITY_CUES[cue];
      if (!entry || !deps.active() || deps.muted()) return;
      deps.play(entry.clip, entry.volume);
    },
  };
}

/** Only the self-paced lesson sounds interactions: the live class has its own volume control and stays as it was. */
const onLessonRoute = () => typeof window !== 'undefined' && /^\/lesson\//.test(window.location.pathname);

export const ITERA_ACTIVITY_SOUND: ActivitySoundPort = createActivitySoundPort({
  play: (clip, volume) => getSoundEngine().play(clip, volume),
  active: onLessonRoute,
  muted: isLessonMuted,
});
