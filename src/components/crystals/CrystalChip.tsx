import { useState } from 'react';
import { CrystalGlyph } from '@/components/crystals/CrystalGlyph';
import { CrystalSheet } from '@/components/crystals/CrystalSheet';
import { LivesBoundary } from '@/components/lives/LivesBoundary';
import { useCrystals } from '@/hooks/useCrystals';
import { useI18n } from '@/i18n';
import { compactCount } from '@/utils/crystals';

function Chip() {
  const { t, locale } = useI18n();
  const { data } = useCrystals();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('crystals.chip', { n: data.balance })}
        title={t('crystals.chip', { n: data.balance })}
        data-testid="header-crystals"
        data-crystals={data.balance}
        className="hd-focus flex h-11 items-center gap-1.5 rounded-full border border-[#262320] bg-[#141210] px-3 transition-colors hover:bg-[#1B1815]"
      >
        <CrystalGlyph size={18} className="text-[#3FD17F]" />
        <span className="[font:700_15px_JetBrains_Mono] tabular-nums text-[#F4EDE2]">{compactCount(data.balance, locale)}</span>
      </button>
      <CrystalSheet open={open} onOpenChange={setOpen} data={data} />
    </>
  );
}

/** Header chip: the crystal balance, next to the lives; opens the "Cristais" sheet. Absent while the crystals backend does not answer. */
export function CrystalChip() {
  return (
    <LivesBoundary>
      <Chip />
    </LivesBoundary>
  );
}
