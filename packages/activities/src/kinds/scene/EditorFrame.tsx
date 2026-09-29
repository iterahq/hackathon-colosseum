import type { ReactNode } from 'react';
import type { ScenePageElementSpec } from '../../specs.js';
import { SceneCodeLine } from './SceneCodeLine.js';

/** A code editor window; the target element's line hosts whatever the beat puts there. */
export function EditorFrame({
  elements,
  targetId,
  targetSlot,
}: {
  elements: ScenePageElementSpec[];
  targetId: string;
  targetSlot: ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0E0D0B] shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]">
      <div className="flex items-center h-9 bg-[#15130F] border-b border-white/5">
        <span className="h-full px-4 flex items-center gap-2 bg-[#0E0D0B] border-t-2 border-evergreen text-xs text-white/80 font-mono">
          <span className="text-[#E07A4A]">&lt;/&gt;</span> index.html
        </span>
      </div>
      <div className="py-5 pr-4 text-[clamp(11px,1.25vw,15px)] leading-[2.2] overflow-x-auto">
        {elements.map((element, i) => (
          <div key={element.id} className="flex">
            <span className="w-10 shrink-0 text-right pr-4 text-white/20 font-mono select-none">{i + 1}</span>
            {element.id === targetId ? targetSlot : <SceneCodeLine element={element} />}
          </div>
        ))}
      </div>
    </div>
  );
}
