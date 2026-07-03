/**
 * Shared fixtures for the v1 general learning-activity Storybook stories
 * (plan 20260703). Not a `*.stories` file, so Storybook won't treat it as a
 * story — it just supplies sample specs + media URLs + an `Activity` factory.
 */
import type { Activity, ActivityKind } from '@/types/content';

// Public CC0 sample media (used only for visual demo in Storybook).
export const SAMPLE_IMAGE = 'https://picsum.photos/seed/itera-activity/640/320';
export const SAMPLE_IMAGE_A = 'https://picsum.photos/seed/itera-a/120/120';
export const SAMPLE_IMAGE_B = 'https://picsum.photos/seed/itera-b/120/120';
export const SAMPLE_IMAGE_C = 'https://picsum.photos/seed/itera-c/120/120';
export const SAMPLE_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
export const SAMPLE_AUDIO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3';

let seq = 0;
/** Build a minimal Activity row wrapping a `kind` + `spec` for a story. */
export function makeActivity(
  kind: ActivityKind,
  spec: Record<string, unknown>,
  status?: Activity['status'],
): Activity {
  seq += 1;
  return {
    id: `story-${kind}-${seq}`,
    lessonId: 'story-lesson',
    ordinal: 0,
    kind,
    spec,
    rubric: null,
    status,
  };
}

/** A no-op result sink; Storybook stories don't advance a real lesson. */
export const noop = (_correct: boolean) => {};
