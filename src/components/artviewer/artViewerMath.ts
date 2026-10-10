/** Pure geometry of the full-screen art viewer: fit, zoom around a point, and how far the art may be dragged. */
export interface Size {
  width: number;
  height: number;
}

export interface View {
  zoom: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
export const ZOOM_STEP = 1.5;
export const VIEW_HOME: View = { zoom: 1, x: 0, y: 0 };

/** The largest box of `aspect` (width / height) that fits the stage. */
export function fitSize(stage: Size, aspect: number): Size {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const width = Math.max(0, Math.min(stage.width, stage.height * ratio));
  return { width, height: width / ratio };
}

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The art may move only as far as it overflows the stage: at fit size it stays centred. */
export function clampPan(view: View, fit: Size, stage: Size): View {
  const maxX = Math.max(0, (fit.width * view.zoom - stage.width) / 2);
  const maxY = Math.max(0, (fit.height * view.zoom - stage.height) / 2);
  return { zoom: view.zoom, x: Math.min(maxX, Math.max(-maxX, view.x)) + 0, y: Math.min(maxY, Math.max(-maxY, view.y)) + 0 };
}

/** Zooms to `zoom` keeping the point under the cursor (given from the stage centre) where it is. */
export function zoomAt(view: View, zoom: number, point: { x: number; y: number }, fit: Size, stage: Size): View {
  const next = clampZoom(zoom);
  const k = next / view.zoom;
  return clampPan({ zoom: next, x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k }, fit, stage);
}
