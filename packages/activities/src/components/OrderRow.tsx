import { useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import type { ChoiceOption } from '../specs.js';
import { SPRING_SETTLE } from './tactile.js';
import { tactileSurface } from './tactileSurface.js';
import { VerdictMark } from './VerdictMark.js';
import { InlineLabel } from './InlineLabel.js';

// A fine pointer (mouse, trackpad) may drag from anywhere on the row; a touch
// screen drags from the grip only, so a swipe on the text still scrolls the page.
const hasFinePointer = () =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;

const NUDGE =
  'w-9 h-[26px] min-[480px]:h-9 flex-shrink-0 inline-flex items-center justify-center rounded-xl border-2 border-b-4 border-border text-muted-foreground transition-[transform,color] duration-100 hover:text-menta active:translate-y-[2px] active:border-b-2 disabled:opacity-30 disabled:hover:text-muted-foreground disabled:active:translate-y-0 disabled:active:border-b-4';
const NUDGE_UP = `${NUDGE} coarse:relative coarse:before:absolute coarse:before:-top-5 coarse:before:-bottom-1 coarse:before:-inset-x-1.5`;
const NUDGE_DOWN = `${NUDGE} coarse:relative coarse:before:absolute coarse:before:-top-1 coarse:before:-bottom-[22px] coarse:before:-inset-x-1.5`;

/**
 * One draggable row of the Order list. The row follows the pointer while the
 * others slide aside; locked rows stay mounted with the same geometry.
 */
export function OrderRow({
  id,
  option,
  position,
  count,
  locked,
  verdict,
  moveUpLabel,
  moveDownLabel,
  onDragStart,
  onDragEnd,
  onNudge,
}: {
  id: string;
  option: ChoiceOption | undefined;
  position: number;
  count: number;
  locked: boolean;
  verdict: 'right' | 'miss' | null;
  moveUpLabel: string;
  moveDownLabel: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onNudge: (delta: -1 | 1) => void;
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
      className={`relative flex items-center gap-2 min-[480px]:gap-2.5 py-2.5 pl-1.5 pr-3 min-[480px]:pl-2 ${tactileSurface(surface, false)} ${
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
        className={`w-6 min-[480px]:w-7 h-9 flex-shrink-0 inline-flex items-center justify-center text-muted-foreground ${locked ? 'opacity-30' : ''}`}
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
      {/* DISABLED, never unmounted. Removing the controls after a
          submit deletes the learner's own reference for what they
          arranged; a disabled control still says "this is the thing you
          used, and it is closed now". */}
      <span className="flex flex-col min-[480px]:flex-row items-center gap-1 min-[480px]:gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onNudge(-1)}
          disabled={locked || position === 0}
          data-testid="order-up"
          aria-label={moveUpLabel}
          className={NUDGE_UP}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onNudge(1)}
          disabled={locked || position === count - 1}
          data-testid="order-down"
          aria-label={moveDownLabel}
          className={NUDGE_DOWN}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </span>
    </Reorder.Item>
  );
}
