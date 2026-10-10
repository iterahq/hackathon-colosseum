import { useState } from 'react';
import { LinkWalletDialog } from '@/components/wallet/LinkWalletDialog';
import { useI18n } from '@/i18n';

/** "Vincular carteira": opens the link dialog. `className` carries the caller's button style. */
export function LinkWalletButton({ className, disabled, testId }: { className: string; disabled?: boolean; testId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} data-testid={testId} className={className}>
        {t('wallet.link.cta')}
      </button>
      {open && <LinkWalletDialog onClose={() => setOpen(false)} />}
    </>
  );
}
