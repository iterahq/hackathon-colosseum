/**
 * The one textarea the activity engine writes into.
 *
 * Five copies of `<textarea>` had drifted apart here, and the divergence was not
 * cosmetic: only the live-chat one guarded IME composition, so on every other
 * surface a learner typing Portuguese with a composing keyboard could have their
 * candidate confirmation swallowed; and only the BYOC seed clamped length, so the
 * others could post a body the server would silently truncate.
 *
 * `variant` covers the two real shapes (a bordered field, and a bare field that
 * sits inside someone else's bordered shell). Everything past that — monospace,
 * `resize-y` — is one utility class the caller appends, not a prop, because a
 * prop per tweak is how the five copies happened in the first place.
 */
import type { TextareaHTMLAttributes } from 'react';
import {
  ACTIVITY_TEXTAREA_BASE,
  ACTIVITY_TEXTAREA_VARIANTS,
  type ActivityTextareaVariant,
} from '../internal/activityTextareaClasses.js';
import { cn } from '../internal/cn.js';

export type ActivityTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  rows: number;
  variant?: ActivityTextareaVariant;
  /** Clamped on input, so the value a caller holds is already the value the server accepts. */
  maxLength?: number;
  /** Enter submits, Shift+Enter keeps the newline. Omit for a plain multiline field. */
  onEnterSubmit?: () => void;
  className?: string;
} & Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'placeholder' | 'disabled' | 'readOnly' | 'autoFocus' | 'aria-label'
> & { 'data-testid'?: string };

export function ActivityTextarea({
  value,
  onChange,
  rows,
  variant = 'boxed',
  maxLength,
  onEnterSubmit,
  className = '',
  ...rest
}: ActivityTextareaProps) {
  return (
    <textarea
      {...rest}
      value={value}
      rows={rows}
      onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
      onKeyDown={
        onEnterSubmit
          ? (e) => {
              // `isComposing` is the load-bearing half: without it, confirming an
              // IME candidate with Enter submits the half-typed word instead.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onEnterSubmit();
              }
            }
          : undefined
      }
      // `cn` (tailwind-merge), e não concatenação: uma classe do chamador que
      // colide com a da variante (`bg-card` sobre `bg-background`, `px-4 py-3`
      // sobre `p-4`) tem a mesma especificidade, então quem ganha na string crua
      // é a ordem do STYLESHEET — invisível daqui e sujeita a mudar num bump do
      // Tailwind. O merge resolve o conflito na origem.
      className={cn(ACTIVITY_TEXTAREA_BASE, ACTIVITY_TEXTAREA_VARIANTS[variant], className)}
    />
  );
}
