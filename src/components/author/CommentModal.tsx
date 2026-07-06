/**
 * Figma-style "add a comment" modal for the per-unit review canvas
 * (plan 20260706, Phase 4). Ported from dfl-lesson-studio's CommentModal,
 * re-keyed onto an ACTIVITY target and wired to `@devfellowship/components`
 * primitives. Opened when Comment mode is ON and an activity cell is clicked.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Textarea,
  Button,
} from '@devfellowship/components';
import { padNumber } from '@/lib/comment-format';

export interface CommentModalTarget {
  activityId: string;
  lessonId: string;
  programId: string;
  lessonTitle: string;
  lessonOrdinal: number;
  activityOrdinal: number;
  activityKind: string;
  /** Relative click coords within the activity cell, 0..1. */
  anchorX?: number | null;
  anchorY?: number | null;
}

interface CommentModalProps {
  target: CommentModalTarget | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (body: string) => void;
}

export const CommentModal = ({
  target,
  submitting = false,
  onClose,
  onSubmit,
}: CommentModalProps) => {
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const open = target !== null;

  useEffect(() => {
    if (open) {
      setBody('');
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, target?.activityId]);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="comment-modal">
        <DialogHeader>
          <DialogTitle>Add comment</DialogTitle>
          {target && (
            <DialogDescription className="font-mono text-[11px]">
              lesson {padNumber(target.lessonOrdinal)}
              {target.lessonTitle ? ` — ${target.lessonTitle}` : ''} · activity{' '}
              {padNumber(target.activityOrdinal)} ({target.activityKind})
            </DialogDescription>
          )}
        </DialogHeader>

        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. troca o enunciado pro pt-BR / adiciona uma opção distratora…"
          className="min-h-[120px]"
          data-testid="comment-body-input"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-testid="comment-submit">
            {submitting ? 'Adding…' : 'Add comment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CommentModal;
