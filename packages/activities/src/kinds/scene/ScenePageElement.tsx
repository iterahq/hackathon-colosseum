import type { ScenePageElementSpec } from '../../specs.js';
import { SCENE_TAG_STYLES } from './sceneTheme.js';

/** How the browser draws one element. `text` overrides the authored text (live typing). */
export function ScenePageElement({ element, text }: { element: ScenePageElementSpec; text?: string }) {
  const content = text ?? element.text;
  return (
    <span style={SCENE_TAG_STYLES[element.tag] ?? SCENE_TAG_STYLES.span} data-scene-tag={element.tag}>
      {content || ' '}
    </span>
  );
}
