/**
 * The lesson images of the activities that come next, so they are already in the
 * browser cache when the learner gets there. An image used to start downloading
 * only when its screen opened, and stayed hidden until it finished.
 *
 * Pure: the URLs are read from the spec text, so an image in `instruction.image_url`,
 * in an option or inside a markdown block is found the same way. Clips are left out
 * (a phone on mobile data should not pull video it may never play).
 */
const IMAGE_URL = /\/lesson-media\/[^\s"'\\)]+\.(?:png|jpe?g|webp|svg|gif)/gi;

export const PRELOAD_AHEAD = 2;

export function lessonImageUrls(spec: unknown): string[] {
  let text: string;
  try {
    text = JSON.stringify(spec ?? null);
  } catch {
    return [];
  }
  return [...new Set(text.match(IMAGE_URL) ?? [])];
}

/** The image URLs of the `ahead` activities after `index`, in order, without repeats. */
export function upcomingImageUrls(activities: readonly { spec?: unknown }[], index: number, ahead = PRELOAD_AHEAD): string[] {
  const next = activities.slice(index + 1, index + 1 + ahead);
  return [...new Set(next.flatMap((activity) => lessonImageUrls(activity.spec)))];
}
