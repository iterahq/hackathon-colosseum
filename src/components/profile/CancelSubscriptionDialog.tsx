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

interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** End of the paid period — the access the learner KEEPS after confirming. */
  endsOn: string | null;
  onConfirm: () => void;
}

/**
 * Confirmação de cancelamento. O texto lidera pela data até quando o acesso
 * continua valendo: quem cancela achando que perde o mês pago escreve pro
 * suporte, e a resposta certa cabe antes do clique.
 */
export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  endsOn,
  onConfirm,
}: CancelSubscriptionDialogProps) {
  const { t } = useI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="cancel-subscription-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('subscription.cancel.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {endsOn
              ? t('subscription.cancel.bodyUntil').replace('{date}', endsOn)
              : t('subscription.cancel.body')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="cancel-subscription-keep">
            {t('subscription.cancel.keep')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} data-testid="cancel-subscription-confirm">
            {t('subscription.cancel.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
