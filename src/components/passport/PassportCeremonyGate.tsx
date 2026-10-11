import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LessonCompleteActions, LessonCompleteCard } from '@/components/branded/lesson/LessonCompleteCard';
import { useCompanion } from '@/hooks/useCompanion';
import { usePassport, usePassportPrefetch } from '@/hooks/usePassport';
import { useI18n } from '@/i18n';
import { preparingModel } from '@/utils/lessonEnd';
import { LoopPanel } from '@/components/loop/LoopPanel';
import { StampCeremony } from './StampCeremony';

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/** The ceremony is a bonus: if anything in it throws, the plain end-of-lesson card takes over. */
class PassportBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.fallback !== null) console.warn('[passport] ceremony disabled:', error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface GateProps {
  lessonId: string | undefined;
  nextLessonId?: string;
  onReview?: () => void;
  /** Activities of the lesson the player knows as completed, and how many the lesson has. */
  doneCount: number;
  total: number;
  /** The lesson was finished in this visit, just now: its end opens straight into the ceremony. */
  fresh?: boolean;
  /** Opens the first unfinished activity of the lesson. */
  onRedoMissing?: () => void;
  /** Where the lesson sits: the trail ordinal and the 1-based day, for "what this day proved". */
  trail?: number | null;
  day?: number | null;
}

function Gate({ lessonId, nextLessonId, onReview, doneCount, total, fresh = false, onRedoMissing, trail, day }: GateProps) {
  const { t } = useI18n();
  const passport = usePassport({ lessonId, fresh, done: doneCount, total });
  const { outfit } = useCompanion();
  const { view } = passport;
  if (view.kind === 'hold') return <div className="min-h-[60svh]" data-testid="lesson-end-hold" aria-busy="true" />;
  if (view.kind === 'incomplete') {
    return <LessonCompleteCard doneCount={view.done} total={view.total} missing={view.missing} nextLessonId={nextLessonId} onRedoMissing={onRedoMissing} />;
  }
  if (view.kind === 'card') {
    return (
      <div className="flex flex-col gap-4">
        <LessonCompleteCard doneCount={doneCount} total={total} nextLessonId={nextLessonId} onReview={onReview} note={view.note ? t('lessonEnd.stampLater') : undefined} />
        <LoopPanel trail={trail} day={day} />
      </div>
    );
  }
  const preparing = view.kind === 'preparing';
  return (
    <div className="flex flex-col gap-4">
      <StampCeremony
        model={preparing ? preparingModel(view.preview) : view.model}
        preparing={preparing}
        colorIndex={passport.colorIndex}
        actions={<LessonCompleteActions nextLessonId={nextLessonId} onReview={onReview} gold={!preparing && view.model.last} />}
        onRetry={passport.retry}
        onLater={passport.dismiss}
        onConnect={passport.connect}
        outfit={outfit}
      />
      {!preparing && <LoopPanel trail={trail} day={day} />}
    </div>
  );
}

/**
 * The end of a lesson. A day finished whole opens straight into the ceremony (minting, then what the server
 * confirmed); an unfinished day gets the card that says what is missing; everything else is the plain card.
 */
export function PassportCeremonyGate(props: GateProps) {
  const { doneCount, total, nextLessonId, onReview } = props;
  return (
    <PassportBoundary fallback={<LessonCompleteCard doneCount={doneCount} total={total} nextLessonId={nextLessonId} onReview={onReview} />}>
      <Gate {...props} />
    </PassportBoundary>
  );
}

function Prefetch() {
  usePassportPrefetch();
  return null;
}

/** Mounted with the lesson: reads the trails early so the end of the lesson knows which day this is. */
export function PassportPrefetch() {
  return (
    <PassportBoundary fallback={null}>
      <Prefetch />
    </PassportBoundary>
  );
}
