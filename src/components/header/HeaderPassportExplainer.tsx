import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { HeaderIcon } from './HeaderIcon';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = ['complete', 'stamp', 'verify'] as const;

/** Three short steps on what the Passport is: finish a day, Tera stamps it on Solana, anyone can verify it. */
export function HeaderPassportExplainer({ open, onOpenChange }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="hd-fade fixed inset-0 z-50 bg-[#0A0908]/75 backdrop-blur-sm" />
        <Dialog.Content
          data-testid="passport-explainer"
          className="hd-pop fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-24px)] w-[min(460px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[#2E2A25] border-b-[5px] border-b-[#262320] bg-[#141210] p-5 text-[#F4EDE2] shadow-[0_24px_60px_rgba(0,0,0,.6)] sm:p-6"
        >
          <span className="flex items-center gap-1.5 [font:600_10px_JetBrains_Mono] uppercase tracking-[.12em] text-[#3FD17F]">
            <HeaderIcon name="passport" size={14} />
            {t('header.nav.passport')}
          </span>
          <Dialog.Title className="mt-2 [font:700_30px_'Barlow_Condensed'] uppercase leading-none tracking-[.02em]">{t('header.explainer.title')}</Dialog.Title>
          <Dialog.Description className="mt-2 [font:400_14px_Inter] text-[#A0978A]">{t('header.explainer.intro')}</Dialog.Description>
          <ol className="mt-5 flex flex-col gap-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3 rounded-[12px] border border-[#262320] bg-[#0F0D0B] p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border-b-[3px] border-b-[#1F8A4F] bg-[#3FD17F] [font:700_20px_'Barlow_Condensed'] text-[#0A0908]" aria-hidden>
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block [font:700_18px_'Barlow_Condensed'] tracking-[.02em]">{t(`header.explainer.${step}.title`)}</span>
                  <span className="mt-0.5 block [font:400_13px_Inter] leading-snug text-[#A0978A]">{t(`header.explainer.${step}.body`)}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close className="hd-press hd-focus h-12 rounded-xl border border-b-[3px] border-[#262320] border-b-[#2E2A25] bg-[#141210] px-5 [font:700_18px_'Barlow_Condensed'] uppercase tracking-[.04em] text-[#F4EDE2]">
              {t('header.explainer.close')}
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate('/passport');
              }}
              className="hd-press hd-focus h-12 rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_20px_'Barlow_Condensed'] uppercase tracking-[.04em] text-[#0A0908]"
            >
              {t('header.explainer.cta')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
