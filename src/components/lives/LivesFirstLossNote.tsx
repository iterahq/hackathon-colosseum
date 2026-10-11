import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { HEART } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';

const SEEN_KEY = 'itera.lives.explained';
/** Mirrors the server's rule (`LESSON_MISS_CAP`, `REGEN_INTERVAL_SECONDS`): shown as copy only, never used to decide. */
const LESSON_MISS_CAP = 3;
const REGEN_MINUTES = 20;

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** The first time a life goes, the header says what lives are for. Once per browser. */
export function LivesFirstLossNote({ lives }: { lives: number | null }) {
  const { t } = useI18n();
  const previous = useRef<number | null>(lives);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const before = previous.current;
    previous.current = lives;
    if (lives === null || before === null || lives >= before || alreadySeen()) return;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* shown again next time, which is fine */
    }
    setOpen(true);
  }, [lives]);

  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="lives-first-loss"
      className="fixed right-3 top-14 z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-[#3A342C] bg-[#141210] p-4 text-left shadow-xl"
    >
      <p className="flex items-center gap-2 [font:700_18px/1.2_'Barlow_Condensed'] text-[#F4EDE2]">
        <Heart aria-hidden width={16} height={16} style={{ color: HEART, fill: HEART }} />
        {t('lives.firstLoss.title')}
      </p>
      <p className="mt-1.5 [font:500_13px/1.45_Inter] text-[#A0978A]">{t('lives.firstLoss.body', { cap: LESSON_MISS_CAP, minutes: REGEN_MINUTES })}</p>
      <button
        type="button"
        onClick={() => setOpen(false)}
        data-testid="lives-first-loss-ok"
        className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#262320] px-3 [font:600_13px_Inter] text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]"
      >
        {t('lives.firstLoss.ok')}
      </button>
    </div>
  );
}
