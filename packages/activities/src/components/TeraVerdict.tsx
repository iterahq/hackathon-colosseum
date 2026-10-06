/**
 * TeraVerdict — Tera reacting to the verdict (happy / oops), with nothing on
 * his face. VerdictMark is the verdict itself: a check or a cross that reads
 * at a glance and without colour, set beside the title. He is added to the
 * verdict, he never replaces it.
 *
 * `missTone` is where the surface sits: inside an activity a miss is dashed
 * and quiet, never red; the host's own footer is allowed its red.
 */
import { Check, X } from 'lucide-react';
import { TeraAvatar, type TeraSize } from './TeraAvatar.js';

export function TeraVerdict({
  correct,
  size = 'bar',
  className = '',
  avatarClassName,
}: {
  correct: boolean;
  size?: TeraSize;
  className?: string;
  avatarClassName?: string;
}) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} aria-hidden="true" data-tera-verdict={correct ? 'right' : 'miss'}>
      <TeraAvatar mood={correct ? 'happy' : 'oops'} size={size} className={avatarClassName} />
    </span>
  );
}

export function VerdictMark({
  correct,
  missTone = 'quiet',
  className = '',
}: {
  correct: boolean;
  missTone?: 'quiet' | 'destructive';
  className?: string;
}) {
  const tone = correct
    ? 'bg-menta text-obsidiana'
    : missTone === 'destructive'
      ? 'bg-destructive text-destructive-foreground'
      : 'border border-dashed border-foreground/40 bg-card text-foreground/70';

  return (
    <span
      className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${tone} ${className}`}
      aria-hidden="true"
      data-verdict-mark={correct ? 'right' : 'miss'}
    >
      {correct ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}
