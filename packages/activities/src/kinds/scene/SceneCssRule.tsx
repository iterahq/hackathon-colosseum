import { SCENE_CODE_BACKGROUND, SCENE_CODE_COLORS as C } from './sceneTheme.js';

/**
 * The one CSS rule a scene is about, as a `style.css` line:
 * `selector { property: value; }`. The page above shows what it does; this
 * shows how it is written, so the name the stamp gives has a line to point at.
 * An empty `selector` draws a dim placeholder (nothing picked yet).
 */
export function SceneCssRule({
  selector,
  property,
  value,
  testId,
}: {
  selector: string | null;
  property: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/10" style={{ background: SCENE_CODE_BACKGROUND }}>
      <div className="flex items-center h-9 bg-[#15130F] border-b border-white/5">
        <span className="h-full px-4 flex items-center gap-2 bg-[#0E0D0B] border-t-2 border-evergreen text-xs text-white/80 font-mono">
          <span style={{ color: C.attr }}>#</span> style.css
        </span>
      </div>
      <div
        data-testid={testId}
        className="py-3 px-4 text-[clamp(12px,1.35vw,16px)] leading-[2] overflow-x-auto font-mono whitespace-pre"
      >
        <span style={{ color: selector ? C.tag : C.bracket }}>{selector || '?'}</span>
        <span style={{ color: C.bracket }}>{' { '}</span>
        <span style={{ color: C.attr }}>{property}</span>
        <span style={{ color: C.bracket }}>: </span>
        <span style={{ color: C.value }}>{value}</span>
        <span style={{ color: C.bracket }}>{'; }'}</span>
      </div>
    </div>
  );
}
