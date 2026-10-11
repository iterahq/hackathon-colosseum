import { useI18n } from '@/i18n';
import type { ChainRead } from '@/types/chainRead';
import { chainReadLabel } from '@/utils/chainRead';

interface Props {
  read: ChainRead | undefined;
  /** The duration measured in the browser, for an answer with no read block. */
  ms: number;
  onRecheck?: () => void;
  rechecking?: boolean;
  className?: string;
}

/** "read from chain in 412 ms" or "read from chain 20 s ago · re-check": the page never calls cached data a fresh read. */
export function ChainReadLine({ read, ms, onRecheck, rechecking = false, className = '' }: Props) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 [font:500_12px_JetBrains_Mono] text-[#A0978A] ${className}`} data-testid="chain-read" data-source={read?.source ?? 'chain'}>
      <span aria-live="polite">{rechecking ? t('chain.rechecking') : chainReadLabel(read, ms, t)}</span>
      {onRecheck && !rechecking && (
        <button
          type="button"
          onClick={onRecheck}
          className="inline-flex min-h-[32px] items-center rounded px-1 text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]"
          data-testid="chain-recheck"
        >
          {t('chain.recheck')}
        </button>
      )}
    </span>
  );
}
