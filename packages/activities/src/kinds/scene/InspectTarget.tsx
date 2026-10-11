import type { KeyboardEvent, ReactNode } from 'react';

const PAGE_TOUCH_SLOP = 'coarse:relative coarse:before:absolute coarse:before:-inset-y-2.5 coarse:before:inset-x-0';

/** One pointable twin — a page element or a source line. Lit when active. */
export function InspectTarget({
  side,
  label,
  active,
  dimmed,
  picked = false,
  wrong = false,
  onEnter,
  onPress,
  onLeave,
  bindRef,
  children,
}: {
  side: 'page' | 'code';
  label: string;
  active: boolean;
  dimmed: boolean;
  /** The piece of the page the learner chose and has not paired yet. */
  picked?: boolean;
  /** The line just pressed belongs to another piece. */
  wrong?: boolean;
  /** The pointer is over it: looking, not choosing. */
  onEnter: () => void;
  /** A tap, a click, Enter or Space: the choice. */
  onPress: () => void;
  onLeave: () => void;
  bindRef: (node: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onPress();
  };
  return (
    <div
      ref={bindRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={onKeyDown}
      onBlur={onLeave}
      onPointerEnter={onEnter}
      onPointerDown={onPress}
      onPointerLeave={onLeave}
      data-testid={`inspect-${side}-target`}
      data-active={active ? 'true' : 'false'}
      data-picked={picked ? 'true' : undefined}
      data-wrong={wrong ? 'true' : undefined}
      className={`self-start rounded-md px-2 py-1 -mx-2 transition-all duration-200 cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen ${side === 'page' ? PAGE_TOUCH_SLOP : ''}`}
      style={{
        outline: wrong ? '2px solid #E0795B' : picked ? '2px dashed #E8B339' : side === 'page' && active ? '2px solid #3FD17F' : '2px solid transparent',
        background: wrong ? 'rgba(224,121,91,.14)' : picked ? 'rgba(232,179,57,.12)' : active ? 'rgba(63,209,127,.13)' : undefined,
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      {children}
    </div>
  );
}
