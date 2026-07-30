import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@devfellowship/components';

/**
 * Icon-only action for the instructor footer: the label lives in the tooltip so
 * "encerrar a aula" — the one action hunted for under pressure — keeps the whole
 * remaining width.
 */
export function LiveSidebarIconAction({
  label,
  testId,
  tone,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  tone: 'neutral' | 'clay';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={disabled ? undefined : onClick}
          // aria-disabled, not disabled: a disabled button takes no pointer or
          // focus events, so the tooltip — the only place the label lives —
          // would never open.
          aria-disabled={disabled}
          data-testid={testId}
          aria-label={label}
          className={`inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
            disabled ? 'opacity-50' : ''
          } ${
            tone === 'clay'
              ? 'border-clay/40 bg-clay/10 text-clay hover:bg-clay/20'
              : 'border-border bg-background text-foreground hover:border-menta/50 hover:bg-menta/10'
          }`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
