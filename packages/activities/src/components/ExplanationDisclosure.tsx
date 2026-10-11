import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const ANIMATION_MS = 180;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Collapsed-by-default "why" disclosure: a compact button that reveals its
 * children inline. Mount it with a `key` that changes per miss / activity so it
 * always starts collapsed. Opening it is purely visual: no callbacks besides the
 * optional `onToggle`, no progress, no submit.
 */
export function ExplanationDisclosure({
  label,
  children,
  className = '',
  buttonClassName = '',
  contentClassName = '',
  buttonTestId = 'explanation-disclosure-toggle',
  contentTestId = 'explanation-disclosure-content',
  onToggle,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  buttonClassName?: string;
  /** Applied to the scrolling region around the children. */
  contentClassName?: string;
  buttonTestId?: string;
  contentTestId?: string;
  onToggle?: (open: boolean) => void;
  /** Shown without a click: a miss is the moment the explanation is for. */
  defaultOpen?: boolean;
}) {
  const regionId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const [visible, setVisible] = useState(defaultOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      setMounted(true);
      if (prefersReducedMotion()) {
        setVisible(true);
        return;
      }
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    if (prefersReducedMotion()) setMounted(false);
    else timer.current = setTimeout(() => setMounted(false), ANIMATION_MS);
  }, [open]);

  return (
    <div className={className} data-testid="explanation-disclosure">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        data-testid={buttonTestId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          onToggle?.(next);
        }}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 font-mono text-[11px] uppercase tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current md:min-h-8 ${buttonClassName}`}
      >
        <span>{label}</span>
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-[180ms] motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3.5 6 8 10.5 12.5 6" />
        </svg>
      </button>
      <div
        id={regionId}
        className={`grid transition-[grid-template-rows,opacity] duration-[180ms] ease-out motion-reduce:transition-none ${
          visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {mounted && (
            <div className={`overflow-y-auto overscroll-contain ${contentClassName}`} data-testid={contentTestId}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
