import { getSoundEngine } from "@/lib/soundEngine";
import type { SoundName } from "@/types/sound";

/** Self-hosted clips from public/vendor/sfx — never a CDN (see CLAUDE.md). */
export type SceneClip = SoundName;

const SCENE_CLIPS: readonly SceneClip[] = ["click", "chime", "success", "submit", "celebration"];

let preloaded = false;

export function playClip(clip: SceneClip, volume = 0.5) {
  const engine = getSoundEngine();
  if (!preloaded) {
    preloaded = true;
    engine.schedulePreload(SCENE_CLIPS);
  }
  engine.play(clip, volume);
}
