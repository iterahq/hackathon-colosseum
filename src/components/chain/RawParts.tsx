import type { ReactNode } from 'react';
import { CopyButton } from '@/components/passport/CopyButton';
import { MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';

export const RAW_BOX = 'flex w-full min-w-0 basis-full flex-col gap-3 rounded-[12px] border border-[#262320] bg-[#0A0908] p-3';

export function RawField({ label, children, testId, className = '' }: { label: string; children: ReactNode; testId?: string; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`} data-testid={testId}>
      <dt className={`${MONO_LABEL} text-[#A0978A]`}>{label}</dt>
      <dd className="min-w-0 break-all [font:500_12px/1.45_JetBrains_Mono] text-[#F4EDE2]">{children}</dd>
    </div>
  );
}

export function RawFields({ children }: { children: ReactNode }) {
  return <dl className="grid min-w-0 gap-2.5 sm:grid-cols-2">{children}</dl>;
}

export function RawSubtitle({ children }: { children: ReactNode }) {
  return <h3 className={`${MONO_LABEL} text-[#3FD17F]`}>{children}</h3>;
}

export function RawNote({ children }: { children: ReactNode }) {
  return <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{children}</p>;
}

/** A shell line the visitor can paste: scrolls sideways inside its own box, with a copy button. */
export function CurlLine({ command }: { command: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="raw-curl">
      <pre className="max-w-full overflow-x-auto rounded-lg border border-[#262320] bg-[#141210] p-2.5 [font:500_11px/1.5_JetBrains_Mono] text-[#C9BFB0]">{command}</pre>
      <div>
        <CopyButton value={command} label={t('verify.copyCommand')} doneLabel={t('bounty.copied')} />
      </div>
    </div>
  );
}

export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <pre tabIndex={0} aria-label={label} className="max-h-[360px] max-w-full overflow-auto rounded-lg border border-[#262320] bg-[#0A0908] p-3 [font:500_11px/1.55_JetBrains_Mono] text-[#C9BFB0]">
      {children}
    </pre>
  );
}

export function RawStatus({ text, error, onRetry }: { text: string; error?: boolean; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role={error ? 'alert' : 'status'} className={`${RAW_BOX} ${error ? 'border-[#E0655A]' : ''} [font:500_13px/1.45_Inter] text-[#C9BFB0]`}>
      {text}
      {onRetry && (
        <div>
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]">
            {t('bounty.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
