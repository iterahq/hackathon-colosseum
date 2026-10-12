import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BTN_SECONDARY, BTN_SMALL, FOCUS } from '@/components/shop/shopStyles';
import { useDayChest, useMyChestsQuery } from '@/hooks/useDayChest';
import { useI18n } from '@/i18n';
import type { Chest } from '@/types/tera';
import { markChestsSeen, unseenChests } from '@/utils/chestSeen';
import { ChestArt } from './ChestArt';
import { DayChest } from './DayChest';
import { ChestBoundary } from './DayChestSlot';

/** The opened chest, standing alone. A chest that is still opening is followed here (it exists already: nothing new is asked for). */
function Reveal({ chest }: { chest: Chest }) {
  const state = useDayChest(chest.lessonId ?? undefined, Boolean(chest.lessonId) && chest.status !== 'minted');
  const shown = state.chest ?? chest;
  const phase = state.phase ?? (shown.status === 'minted' && shown.tera ? 'revealed' : shown.seed ? 'rolling' : 'committed');
  return <DayChest phase={phase} chest={shown} day={shown.day} size="hero" />;
}

function Cue() {
  const { t } = useI18n();
  const list = useMyChestsQuery(true);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const chests = list.data?.enabled ? list.data.chests : [];
  // Read once per list: opening the reveal marks the chest seen, and the cue must not vanish under the dialog.
  const found = useMemo(() => unseenChests(chests), [chests]);
  // What the dialog was opened on stays on screen even after the list is read again without it.
  const [held, setHeld] = useState<Chest[] | null>(null);
  const waiting = held ?? found;
  const first = waiting[0];
  if (!first || dismissed) return null;
  const close = () => {
    markChestsSeen(waiting.map((c) => c.id));
    setOpen(false);
    setDismissed(true);
  };
  return (
    <>
      <div className="flex min-w-0 items-center gap-3 rounded-[14px] border border-[#2E2A25] border-l-[3px] border-l-[#F2C66D] bg-[#141210] px-3 py-2" data-testid="chest-cue" data-status={first.status}>
        <ChestArt open={false} color="#F2C66D" size={36} still />
        <span className="min-w-0 flex-1 [font:500_14px/1.35_Inter] text-[#C9BFB0]">{t(first.status === 'minted' ? 'chest.cue.minted' : 'chest.cue.pending', { n: first.day, trail: first.trail })}</span>
        <button type="button" onClick={() => (setHeld(found), setOpen(true))} className={`${BTN_SECONDARY} ${BTN_SMALL} flex-none`} data-testid="chest-cue-open">
          {t('chest.cue.open')}
        </button>
      </div>
      <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#0A0908]/85 backdrop-blur-sm" />
          <Dialog.Content aria-describedby={undefined} data-testid="chest-cue-dialog" className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[min(420px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-[16px] border border-[#2E2A25] bg-[#0F0D0B] p-4 text-[#F4EDE2]">
            <Dialog.Title className="m-0 text-center [font:600_11px_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]">{t('chest.cue.title', { n: first.day, trail: first.trail })}</Dialog.Title>
            <Reveal chest={first} />
            {waiting.length > 1 && (
              <Link to="/passport" onClick={close} className={`self-center [font:600_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`} data-testid="chest-cue-more">
                {t('chest.cue.more', { n: waiting.length - 1 })} →
              </Link>
            )}
            <Dialog.Close className={`min-h-11 w-full rounded-[12px] border-2 border-b-[5px] border-[#2E2A25] bg-[#141210] px-5 [font:700_15px_Inter] text-[#F4EDE2] hover:border-[#5E574E] ${FOCUS}`} data-testid="chest-cue-close">
              {t('chest.cue.close')}
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** One quiet line where the learner lands: a chest opened (or is opening) that this browser never showed. It opens the reveal; closing it is the end of it. */
export function ChestCue() {
  return (
    <ChestBoundary>
      <Cue />
    </ChestBoundary>
  );
}
