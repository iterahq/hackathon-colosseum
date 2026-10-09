import { describe, it, expect, vi } from 'vitest';
import { ACTIVITY_CUES, createActivitySoundPort } from '@/lib/activitySoundPort';
import { SOUND_URLS } from '@/lib/soundClips';
import type { ActivitySoundCue } from '@iterahq/activities';

function setup(active = true, muted = false) {
  const play = vi.fn();
  return { play, port: createActivitySoundPort({ play, active: () => active, muted: () => muted }) };
}

describe('activity sound port adapter', () => {
  it('maps every cue to a shipped clip at a fixed volume', () => {
    for (const [cue, { clip, volume }] of Object.entries(ACTIVITY_CUES)) {
      expect(SOUND_URLS[clip], cue).toBeTruthy();
      expect(volume).toBeGreaterThan(0);
      expect(volume).toBeLessThanOrEqual(0.5);
    }
  });

  it('plays the mapped clip', () => {
    const { play, port } = setup();
    port.play('connect');
    expect(play).toHaveBeenCalledWith('submit', 0.25);
  });

  it('is silent when the lesson is muted', () => {
    const { play, port } = setup(true, true);
    port.play('pick');
    expect(play).not.toHaveBeenCalled();
  });

  it('is silent outside the self-paced lesson (live class keeps its own sound)', () => {
    const { play, port } = setup(false);
    port.play('complete');
    expect(play).not.toHaveBeenCalled();
  });

  it('ignores a cue it does not know', () => {
    const { play, port } = setup();
    port.play('nope' as ActivitySoundCue);
    expect(play).not.toHaveBeenCalled();
  });
});
