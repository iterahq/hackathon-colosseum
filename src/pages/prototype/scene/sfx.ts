/** Self-hosted clips from public/vendor/sfx — never a CDN (see CLAUDE.md). */
export type SceneClip = "click" | "chime" | "success" | "celebration" | "error" | "submit";

const cache = new Map<SceneClip, HTMLAudioElement>();

export function playClip(clip: SceneClip, volume = 0.5) {
  try {
    let audio = cache.get(clip);
    if (!audio) {
      audio = new Audio(`/vendor/sfx/${clip}.mp3`);
      cache.set(clip, audio);
    }
    audio.volume = volume;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // Audio is garnish; a blocked autoplay must never break the scene.
  }
}
