import { useState } from 'react';
import { RawAccount } from '@/components/chain/RawAccount';
import { RawTransaction } from '@/components/chain/RawTransaction';
import { FOCUS } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { explorerLinks, type ExplorerKind } from '@/lib/explorer';

interface Props {
  kind: ExplorerKind;
  value: string;
  label?: string;
  compact?: boolean;
  linkClassName?: string;
  className?: string;
  /** Offer the raw view. Off: only the other explorers are added. */
  raw?: boolean;
  /** Off: the primary link is already on screen, only the alternatives are added. */
  primary?: boolean;
}

const PRIMARY = `inline-flex min-h-11 items-center rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`;
const SECONDARY = `inline-flex min-h-11 items-center rounded px-1 [font:500_12px_JetBrains_Mono] text-[#A0978A] hover:text-[#F4EDE2] hover:underline ${FOCUS}`;

/** The link to the explorer, two other explorers, and the raw data read by the visitor's own browser. */
export function ChainProof({ kind, value, label, compact = false, linkClassName, className = '', raw = true, primary = true }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [first, ...others] = explorerLinks(kind, value);
  const text = label ?? t('bounty.explorer');
  return (
    <span className={`flex min-w-0 flex-wrap items-center ${compact ? 'gap-x-1' : 'gap-x-2 max-sm:grid max-sm:grid-cols-2'} ${className} ${open ? 'w-full basis-full' : ''}`} data-testid="chain-proof">
      {primary && (
        <a href={first.url} target="_blank" rel="noopener noreferrer" className={linkClassName ?? PRIMARY}>
          {/↗\s*$/.test(text) ? text : `${text} ↗`}
        </a>
      )}
      {others.map((link) => (
        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className={SECONDARY} data-testid={`chain-proof-${link.id}`}>
          {link.label}
        </a>
      ))}
      {raw && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={SECONDARY} data-testid="chain-proof-raw">
          {open ? t('verify.raw.hide') : t('verify.raw.show')}
        </button>
      )}
      {raw && open && <span className="block w-full basis-full max-sm:col-span-2">{kind === 'tx' ? <RawTransaction signature={value} /> : <RawAccount address={value} />}</span>}
    </span>
  );
}
