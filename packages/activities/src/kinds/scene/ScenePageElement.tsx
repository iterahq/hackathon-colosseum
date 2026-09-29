import type { CSSProperties } from 'react';
import type { ScenePageElementSpec } from '../../specs.js';
import { SCENE_RAW_TAG_STYLES, SCENE_TAG_STYLES } from './sceneTheme.js';

/**
 * How the browser draws one element. `text` overrides the authored text (live typing).
 * `style` is the page's own CSS (a `dial` value, a `plug` stylesheet): it lands ON the element,
 * after the tag's look, because the tag look sets `color` and `font-size` itself and would
 * win over anything set on a wrapper. `raw` swaps the tag look for the browser default
 * (a page with no CSS loaded).
 */
export function ScenePageElement({
  element,
  text,
  style,
  raw = false,
}: {
  element: ScenePageElementSpec;
  text?: string;
  style?: CSSProperties;
  raw?: boolean;
}) {
  const content = text ?? element.text;
  const styles = raw ? SCENE_RAW_TAG_STYLES : SCENE_TAG_STYLES;
  const base = styles[element.tag] ?? styles.span;
  return (
    <span style={style ? { ...base, ...style } : base} data-scene-tag={element.tag}>
      {content || ' '}
    </span>
  );
}
