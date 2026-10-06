import type { KeyboardEvent, ReactNode } from 'react';

const PAGE_TOUCH_SLOP = 'coarse:relative coarse:before:absolute coarse:before:-inset-y-2.5 coarse:before:inset-x-0';

/** One pointable twin — a page element or a source line. Lit when active. */
export function InspectTarget({
  side,
  label,
  active,
  dimmed,
  onEnter,
  onLeave,
  bindRef,
  children,
}: {
  side: 'page' | 'code';
  label: string;
  active: boolean;
  dimmed: boolean;
  onEnter: () => void;
  onLeave: () => void;
  bindRef: (node: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onEnter();
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
      onPointerDown={onEnter}
      onPointerLeave={onLeave}
      data-testid={`inspect-${side}-target`}
      data-active={active ? 'true' : 'false'}
      className={`self-start rounded-md px-2 py-1 -mx-2 transition-all duration-200 cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen ${side === 'page' ? PAGE_TOUCH_SLOP : ''}`}
      style={{
        outline: side === 'page' && active ? '2px solid #3FD17F' : '2px solid transparent',
        background: active ? 'rgba(63,209,127,.13)' : undefined,
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      {children}
    </div>
  );
}
