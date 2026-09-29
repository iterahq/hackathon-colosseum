import type { ScenePageElementSpec, SceneTag } from '../../specs.js';
import { SceneCodeLine } from './SceneCodeLine.js';
import { ScenePageElement } from './ScenePageElement.js';

/** Both layers share these row heights, so each source line sits exactly under
 * the element it draws — the x-ray is a map, not a picture of random code. */
const ROW_HEIGHT: Partial<Record<SceneTag, number>> = { h1: 64, h2: 52, h3: 40, button: 52 };

export function XrayRows({ elements, layer }: { elements: ScenePageElementSpec[]; layer: 'page' | 'code' }) {
  return (
    <div className="flex flex-col justify-center h-full px-[6%] sm:px-[8%] gap-4 pt-8">
      {elements.map((element) => (
        <div key={element.id} className="flex items-center" style={{ height: ROW_HEIGHT[element.tag] ?? 32 }}>
          {layer === 'page' ? (
            <ScenePageElement element={element} />
          ) : (
            <SceneCodeLine element={element} style={{ fontSize: 'clamp(12px, 1.5vw, 18px)' }} />
          )}
        </div>
      ))}
    </div>
  );
}
