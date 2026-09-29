import type { CSSProperties } from 'react';
import type { ScenePageElementSpec } from '../../specs.js';
import { SCENE_TAG_STYLES } from './sceneTheme.js';

/**
 * How the browser draws one element. `text` overrides the authored text (live typing).
 * `style` is the page's own CSS (a `dial` value, a `plug` stylesheet): it lands ON the element,
 * after the tag's look, because the tag look sets `color` and `font-size` itself and would
 * win over anything set on a wrapper.
 */
export function ScenePageElement({
  element,
  text,
  style,
}: {
  element: ScenePageElementSpec;
  text?: string;
  style?: CSSProperties;
}) {
  const content = text ?? element.text;
  const base = SCENE_TAG_STYLES[element.tag] ?? SCENE_TAG_STYLES.span;
  return (
    <span style={style ? { ...base, ...style } : base} data-scene-tag={element.tag}>
      {content || ' '}
    </span>
  );
}
