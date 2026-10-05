/**
 * hoverTravel — whether a pointer that left the thumbnail is on its way to
 * the switch on the open preview. The preview survives while each sample
 * gets closer to the switch (a few px of jitter allowed) or sits on it; the
 * first sample that moves away closes it, so sweeping off the image still
 * feels instant.
 */
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const TRAVEL_TOLERANCE_PX = 8;

export function isInside(point: Point, rect: Rect, pad = 0): boolean {
  return (
    point.x >= rect.left - pad &&
    point.x <= rect.left + rect.width + pad &&
    point.y >= rect.top - pad &&
    point.y <= rect.top + rect.height + pad
  );
}

/** Distance from the point to the nearest edge of the rect; 0 inside it. */
export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - (rect.left + rect.width));
  const dy = Math.max(rect.top - point.y, 0, point.y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

export function travelKeepsOpen(
  previous: Point | null,
  current: Point,
  target: Rect,
  tolerance = TRAVEL_TOLERANCE_PX,
): boolean {
  if (isInside(current, target, tolerance)) return true;
  if (!previous) return true;
  return distanceToRect(current, target) <= distanceToRect(previous, target) + tolerance;
}
