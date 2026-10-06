import type { SoundName } from '@/types/sound';

// Served from our own origin, never a public CDN — see docs/vendoring-sem-cdn.md.
export const SOUND_URLS: Record<SoundName, string> = {
  success: '/vendor/sfx/success.mp3',
  error: '/vendor/sfx/error.mp3',
  click: '/vendor/sfx/click.mp3',
  celebration: '/vendor/sfx/celebration.mp3',
  chime: '/vendor/sfx/chime.mp3',
  submit: '/vendor/sfx/submit.mp3',
};

/** Kept on a data-saver connection: 117 kB together, and they are the verdict itself. */
export const ESSENTIAL_SOUNDS: readonly SoundName[] = ['success', 'error', 'click'];

/**
 * A clip that is not ready when asked for plays only if it becomes ready within
 * this window. Past it the sound no longer belongs to what the learner did, and
 * a late verdict sound is the bug the engine exists to fix.
 */
export const LATE_PLAY_BUDGET_MS = 300;

/**
 * On iOS an `AudioContext` plays on the ambient session, which the ring/silent
 * switch mutes; a media element plays on the playback session, which it does
 * not. `playback` is the only Audio Session type WebKit maps to a category that
 * ignores the switch (`transient` and `ambient` both map to the ambient one).
 * Its cost: it is exclusive, so music from another app can pause while the
 * lesson has sound on — as it did when the clips were media elements.
 */
export const SILENT_SWITCH_PROOF_SESSION_TYPE = 'playback';
