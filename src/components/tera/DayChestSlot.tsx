import { Component, type ReactNode } from 'react';
import { BTN_SECONDARY, BTN_SMALL, CARD } from '@/components/shop/shopStyles';
import { useDayChest, useMyChests } from '@/hooks/useDayChest';
import { useWalletLink } from '@/hooks/useWalletLink';
import { useI18n } from '@/i18n';
import { ChestArt } from './ChestArt';
import { DayChest } from './DayChest';

/** A failure inside the chest renders nothing: the stamp ceremony and the lesson end around it must never pay for it. */
export class ChestBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[chest] hidden:', error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface SlotProps {
  lessonId: string | undefined;
  day: number;
  /** The day is stamped on chain. */
  active: boolean;
  /** A day finished earlier, found again: its chest is looked up, and a day with none is only offered behind a button. */
  still?: boolean;
  /** `hero`: the chest and what comes out of it are the big thing on the screen. */
  size?: 'row' | 'hero';
}

function Slot({ lessonId, day, active, still = false, size = 'row' }: SlotProps) {
  const { t } = useI18n();
  const { wallet } = useWalletLink();
  const state = useDayChest(lessonId, active, still ? 'found' : 'stamped');
  if (state.phase) return <DayChest phase={state.phase} chest={state.chest} day={day} still={still && !state.justOpened} size={size} />;
  if (!still || !wallet) return null;
  if (state.nothing) return <p className="[font:500_13px/1.4_Inter] text-[#A0978A]" data-testid="day-chest-none" role="status">{t('chest.none')}</p>;
  if (!state.canOpen && !state.opening) return null;
  return (
    <div className={`${CARD} flex min-w-0 items-center gap-3 p-3`} data-testid="day-chest-offer">
      <ChestArt open={false} color="#F2C66D" size={56} still />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span className="[font:400_13px/1.4_Inter] text-[#C9BFB0]">{t('chest.openHint')}</span>
        <button type="button" onClick={state.open} disabled={state.opening} className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="day-chest-open">
          {t(state.opening ? 'chest.opening' : 'chest.open', { n: day })}
        </button>
      </div>
    </div>
  );
}

/** The chest of the day `lessonId` stamped, or nothing: feature off, no chest, or a chest that failed. */
export function DayChestSlot(props: SlotProps) {
  return (
    <ChestBoundary>
      <Slot {...props} />
    </ChestBoundary>
  );
}

function Prefetch() {
  useMyChests();
  return null;
}

/** Mounted with the lesson: asks whether chests are on, so the end of the day does not wait to know. Renders nothing. */
export function DayChestPrefetch() {
  return (
    <ChestBoundary>
      <Prefetch />
    </ChestBoundary>
  );
}
