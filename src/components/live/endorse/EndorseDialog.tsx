import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useI18n } from '@/i18n';
import { NOTE_MAX } from '@/services/endorsement.service';
import type { StudentCertification } from '@/types/endorsement';
import { shortAddress } from '@/utils/headerHud';

interface Props {
  target: StudentCertification | null;
  wallet: string | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}

/** The confirmation before an endorsement: it is written on chain, public and cannot be taken back. */
export function EndorseDialog({ target, wallet, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const [note, setNote] = useState('');

  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent data-testid="endorse-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('endorse.dialog.title', { name: target?.learnerName ?? t('endorse.learner') })}</AlertDialogTitle>
          <AlertDialogDescription>{t('endorse.dialog.body', { trail: target?.trail ?? '', wallet: wallet ? shortAddress(wallet) : '' })}</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {t('endorse.dialog.note')}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            maxLength={NOTE_MAX}
            rows={3}
            data-testid="endorse-note"
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <span className="text-xs">{t('endorse.dialog.noteHint', { left: NOTE_MAX - note.length })}</span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="endorse-cancel">{t('endorse.dialog.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => (onConfirm(note), setNote(''))} data-testid="endorse-confirm">
            {t('endorse.dialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
