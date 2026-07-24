import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveStagePicker } from '@/components/live/LiveStagePicker';
import type { StagePickerLearner } from '@/types/liveClass';

interface LiveStageModalProps {
  open: boolean;
  onClose: () => void;
  learners: StagePickerLearner[];
  staged: boolean;
  pendingUserId?: string | null;
  unreachableUserId?: string | null;
  onPull: (userId: string) => void;
  onClear: () => void;
}

/**
 * B5: the pull-to-stage picker moved out of the sidebar into a modal. A room
 * with many students would shrink the inline list to nothing; a button in the
 * sidebar opens this instead, so the roster keeps its space.
 */
export function LiveStageModal({
  open,
  onClose,
  learners,
  staged,
  pendingUserId,
  unreachableUserId,
  onPull,
  onClear,
}: LiveStageModalProps) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on open and hand it back to the trigger on close,
  // so keyboard users aren't stranded on the page behind the modal.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidiana/70 backdrop-blur-sm"
      data-testid="live-stage-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('live.stage.picker.title')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end p-2">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="live-stage-modal-close"
            aria-label={t('live.stage.picker.title')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <LiveStagePicker
          learners={learners}
          staged={staged}
          pendingUserId={pendingUserId}
          unreachableUserId={unreachableUserId}
          onPull={onPull}
          onClear={onClear}
        />
      </div>
    </div>
  );
}
