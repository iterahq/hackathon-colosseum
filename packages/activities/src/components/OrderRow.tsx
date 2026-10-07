import { useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import type { ChoiceOption } from '../specs.js';
import { SPRING_SETTLE } from './tactile.js';
import { tactileSurface } from './tactileSurface.js';
import { VerdictMark } from './VerdictMark.js';
import { InlineLabel } from './InlineLabel.js';

// A fine pointer (mouse, trackpad) may drag from anywhere on the row; a touch
// screen drags from the grip only, so a swipe on the text still scrolls the page.
const hasFinePointer = () =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;

/**
 * One draggable row of the Order list. The row follows the pointer while the
 * others slide aside; locked rows stay mounted with the same geometry.
 */
export function OrderRow({
  id,
  option,
  position,
  locked,
  verdict,
  onDragStart,
  onDragEnd,
}: {
  id: string;
  option: ChoiceOption | undefined;
  position: number;
  locked: boolean;
  verdict: 'right' | 'miss' | null;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  const fine = hasFinePointer();
  const surface = dragging ? 'lifted' : verdict === 'right' ? 'right' : verdict === 'miss' ? 'miss' : 'idle';

  return (
    <Reorder.Item
      as="li"
      value={id}
      dragListener={false}
      dragControls={controls}
      transition={reduced ? { duration: 0 } : SPRING_SETTLE}
      whileDrag={reduced ? undefined : { scale: 1.02 }}
      onDragStart={() => {
        setDragging(true);
        onDragStart();
      }}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd();
      }}
      onPointerDown={(e: React.PointerEvent<HTMLLIElement>) => {
        // A press on a control inside the row is that control's, not a drag.
        if (!locked && fine && !(e.target as Element).closest('audio, button, a')) controls.start(e);
      }}
      data-testid="order-item"
      // The AUTHORED item id — what `correct_order` is keyed on. The
      // rendered position is per-learner and changes as they reorder.
      data-option-id={id}
      data-position={position}
      data-verdict={verdict ?? undefined}
      className={`relative flex items-center gap-2 min-[480px]:gap-2.5 py-2.5 pl-1.5 pr-3 min-[480px]:pl-2 ${tactileSurface(surface, false, true)} ${
        locked ? '' : dragging ? 'cursor-grabbing' : fine ? 'cursor-grab' : ''
      } ${dragging ? 'z-10' : ''}`}
    >
      {/* Kept mounted when locked (dimmed) so the row keeps the exact
          geometry the learner was looking at when they submitted. */}
      <span
        onPointerDown={(e) => {
          if (!locked && !fine) controls.start(e);
        }}
        style={{ touchAction: locked || fine ? undefined : 'none' }}
        data-testid="order-grip"
        className={`w-6 min-[480px]:w-7 h-9 flex-shrink-0 inline-flex items-center justify-center text-muted-foreground coarse:relative coarse:before:absolute coarse:before:-inset-y-1.5 coarse:before:-inset-x-2 ${locked ? 'opacity-30' : ''}`}
      >
        <GripVertical className="w-4 h-4" aria-hidden />
      </span>
      <span className="w-7 h-7 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-evergreen-soft text-menta font-mono text-xs font-semibold">
        {position + 1}
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {option?.image_url && (
          <img src={option.image_url} alt={option.label ?? id} draggable={false} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
        )}
        {option?.label && <span className="flex-1 min-w-0 break-words text-sm min-[480px]:text-base"><InlineLabel text={option.label} /></span>}
        {option?.audio_url && <audio src={option.audio_url} controls className="h-7 max-w-[8rem]" />}
      </div>
      <VerdictMark verdict={verdict} delay={position * 0.04} />
    </Reorder.Item>
  );
}
