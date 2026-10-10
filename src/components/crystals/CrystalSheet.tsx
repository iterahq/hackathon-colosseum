import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import { CrystalGlyph } from '@/components/crystals/CrystalGlyph';
import { CRYSTAL_LORE } from '@/content/teraLore';
import { useI18n } from '@/i18n';
import type { CrystalsSnapshot } from '@/types/crystals';
import { ledgerLabel } from '@/utils/crystals';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CrystalsSnapshot;
}

const SECTION = '[font:600_10px_JetBrains_Mono] uppercase tracking-[.12em] text-[#A0978A]';

/** "Cristais": the balance, how to earn, the last movements, the explorer link and one line of lore. */
export function CrystalSheet({ open, onOpenChange, data }: Props) {
  const { t, locale } = useI18n();
  const lore = CRYSTAL_LORE(locale);
  const labelOf = (reason: string, refId: string | null) => ledgerLabel(reason, refId, t, (key) => data.themeItems.find((i) => i.key === key)?.title ?? null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="hd-fade fixed inset-0 z-50 bg-[#0A0908]/75 backdrop-blur-sm" />
        <Dialog.Content data-testid="crystal-sheet" className="hd-pop fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-24px)] w-[min(460px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[#2E2A25] border-b-[5px] border-b-[#262320] bg-[#141210] p-5 text-[#F4EDE2] shadow-[0_24px_60px_rgba(0,0,0,.6)] sm:p-6">
          <span className={`flex items-center gap-1.5 text-[#3FD17F] ${SECTION} !text-[#3FD17F]`}>
            <CrystalGlyph size={14} />
            {t('crystals.sheet.balance')}
          </span>
          <Dialog.Title className="mt-1 flex items-baseline gap-2 [font:700_56px/1_'Barlow_Condensed']">
            <span data-testid="crystal-sheet-balance" className="tabular-nums">{data.balance}</span>
            <span className="[font:600_14px_Inter] text-[#A0978A]">{lore.name || t('crystals.name')}</span>
          </Dialog.Title>
          <Dialog.Description className="mt-2 [font:400_14px/1.45_Inter] text-[#C9BFB0]">{lore.line}</Dialog.Description>
          <p className="mt-1 [font:400_12px/1.4_Inter] text-[#A0978A]">{t('crystals.sheet.earnedOnly')}</p>

          <h3 className={`mt-5 ${SECTION}`}>{t('crystals.sheet.earn')}</h3>
          <ul className="mt-2 flex flex-col gap-1.5" data-testid="crystal-sheet-earn">
            {data.earnRules.map((rule) => (
              <li key={rule.reason} className="flex items-baseline justify-between gap-3 rounded-[10px] border border-[#262320] bg-[#0F0D0B] px-3 py-2 [font:500_13px/1.3_Inter]">
                <span className="min-w-0 text-[#C9BFB0]">{rule.label}</span>
                <span className="shrink-0 [font:700_13px_JetBrains_Mono] tabular-nums text-[#3FD17F]">+{rule.crystals}</span>
              </li>
            ))}
          </ul>

          <h3 className={`mt-5 ${SECTION}`}>{t('crystals.sheet.recent')}</h3>
          {data.ledger.length === 0 ? (
            <p className="mt-2 [font:400_13px_Inter] text-[#A0978A]">{t('crystals.sheet.empty')}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1" data-testid="crystal-sheet-ledger">
              {data.ledger.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 [font:500_13px/1.3_Inter]">
                  <span className="min-w-0 truncate text-[#C9BFB0]">{labelOf(entry.reason, entry.refId)}</span>
                  <span className={`shrink-0 [font:700_13px_JetBrains_Mono] tabular-nums ${entry.delta >= 0 ? 'text-[#3FD17F]' : 'text-[#A0978A]'}`}>{entry.delta >= 0 ? `+${entry.delta}` : entry.delta}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {data.explorerUrl ? (
              <a href={data.explorerUrl} target="_blank" rel="noopener noreferrer" data-testid="crystal-sheet-explorer" className="hd-focus rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline">
                {t('crystals.sheet.explorer')} ↗
              </a>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Dialog.Close className="hd-press hd-focus h-11 rounded-xl border border-b-[3px] border-[#262320] border-b-[#2E2A25] bg-[#141210] px-4 [font:700_16px_'Barlow_Condensed'] uppercase tracking-[.04em]">{t('crystals.sheet.close')}</Dialog.Close>
              <Link to="/shop?tab=wardrobe" onClick={() => onOpenChange(false)} className="hd-press hd-focus grid h-11 place-items-center rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-5 [font:700_16px_'Barlow_Condensed'] uppercase tracking-[.04em] text-[#0A0908]">
                {t('crystals.sheet.shop')}
              </Link>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
