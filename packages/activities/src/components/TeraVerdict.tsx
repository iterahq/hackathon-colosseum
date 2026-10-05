/**
 * TeraVerdict — Tera carrying the verdict as a sticker on his bottom-right
 * corner. He reacts (happy / oops), the badge says it: a check or a cross
 * that reads at a glance and without colour. He is added to the verdict, he
 * never replaces it.
 *
 * `missTone` is where the surface sits: inside an activity a miss is dashed
 * and quiet, never red; the host's own footer is allowed its red.
 */
import { Check, X } from 'lucide-react';
import { TeraAvatar, type TeraSize } from './TeraAvatar.js';

export function TeraVerdict({
  correct,
  size = 'bar',
  missTone = 'quiet',
  ringClassName = 'ring-card',
  className = '',
}: {
  correct: boolean;
  size?: TeraSize;
  missTone?: 'quiet' | 'destructive';
  /** The ring takes the colour behind him, so the badge reads as a sticker. */
  ringClassName?: string;
  className?: string;
}) {
  const badge = correct
    ? 'bg-menta text-obsidiana'
    : missTone === 'destructive'
      ? 'bg-destructive text-destructive-foreground'
      : 'border border-dashed border-foreground/40 bg-card text-foreground/70';

  return (
    <span className={`relative inline-block shrink-0 ${className}`} aria-hidden="true" data-tera-verdict={correct ? 'right' : 'miss'}>
      <TeraAvatar mood={correct ? 'happy' : 'oops'} size={size} />
      <span
        className={`absolute -bottom-0.5 -right-1 flex h-[22px] w-[22px] items-center justify-center rounded-full ring-2 ${ringClassName} ${badge}`}
      >
        {correct ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </span>
  );
}
