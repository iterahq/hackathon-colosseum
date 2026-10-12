import { Component, type ReactNode } from 'react';
import { useDayChest, useMyChests } from '@/hooks/useDayChest';
import { DayChest } from './DayChest';

/** A failure inside the chest renders nothing: the stamp ceremony and the lesson end around it must never pay for it. */
class ChestBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
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
  /** A day finished earlier, found again: no "sealing" row, no reveal. */
  still?: boolean;
}

function Slot({ lessonId, day, active, still = false }: SlotProps) {
  const { phase, chest } = useDayChest(lessonId, active);
  if (!phase || (still && !chest)) return null;
  return <DayChest phase={phase} chest={chest} day={day} still={still} />;
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
