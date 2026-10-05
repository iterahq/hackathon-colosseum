/**
 * mediaPreviewFit — how big the hover preview of an image gets.
 *
 * As large as the viewport allows inside the margins, never past the image's
 * own pixels by more than a quarter: a lesson diagram is read, and text
 * blown up past that smears. Aspect ratio is always kept.
 */
export interface Size {
  width: number;
  height: number;
}

export const PREVIEW_VIEWPORT_WIDTH = 0.9;
export const PREVIEW_VIEWPORT_HEIGHT = 0.85;
export const PREVIEW_MAX_UPSCALE = 1.25;

export function fitPreview(natural: Size, viewport: Size): Size {
  if (natural.width <= 0 || natural.height <= 0) return { width: 0, height: 0 };
  const maxWidth = viewport.width * PREVIEW_VIEWPORT_WIDTH;
  const maxHeight = viewport.height * PREVIEW_VIEWPORT_HEIGHT;
  const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height, PREVIEW_MAX_UPSCALE);
  return {
    width: Math.round(natural.width * scale),
    height: Math.round(natural.height * scale),
  };
}

/** A preview has to be worth opening: at least this much larger than the thumbnail on one side. */
export const PREVIEW_MIN_GAIN = 1.15;

export function isWorthPreviewing(fit: Size, rendered: Size | null): boolean {
  if (fit.width <= 0 || fit.height <= 0) return false;
  if (!rendered || rendered.width <= 0 || rendered.height <= 0) return true;
  return fit.width >= rendered.width * PREVIEW_MIN_GAIN || fit.height >= rendered.height * PREVIEW_MIN_GAIN;
}
