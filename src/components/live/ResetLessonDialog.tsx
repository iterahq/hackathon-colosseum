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

interface ResetLessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quantos dos presentes já responderam — é o que a turma perde ao confirmar. */
  answeredCount: number;
  presentCount: number;
  onConfirm: () => void;
}

/**
 * Confirmação de "resetar a lição para todos". O corte é irreversível pela UI e
 * atinge a sala inteira, então o número de quem perde a resposta aparece ANTES
 * do clique, e não num toast depois dele.
 */
export function ResetLessonDialog({
  open,
  onOpenChange,
  answeredCount,
  presentCount,
  onConfirm,
}: ResetLessonDialogProps) {
  const { t } = useI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="reset-lesson-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('live.instructor.reset.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('live.instructor.reset.body', { count: answeredCount, present: presentCount })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="reset-lesson-cancel">
            {t('live.instructor.reset.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} data-testid="reset-lesson-confirm">
            {t('live.instructor.reset.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
