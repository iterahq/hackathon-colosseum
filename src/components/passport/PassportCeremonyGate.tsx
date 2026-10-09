import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LessonCompleteActions } from '@/components/branded/lesson/LessonCompleteCard';
import { usePassport } from '@/hooks/usePassport';
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
    console.warn('[passport] ceremony disabled:', error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface GateProps {
  lessonId: string | undefined;
  nextLessonId?: string;
  onReview?: () => void;
  /** The regular end-of-lesson card, shown whenever there is no ceremony. */
  card: ReactNode;
}

function Gate({ lessonId, nextLessonId, onReview, card }: GateProps) {
  const passport = usePassport({ lessonId, active: true });
  if (!passport.model) return <>{card}</>;
  return (
    <StampCeremony
      model={passport.model}
      colorIndex={passport.colorIndex}
      actions={<LessonCompleteActions nextLessonId={nextLessonId} onReview={onReview} />}
      onRetry={passport.retry}
      onLater={passport.dismiss}
      onConnect={passport.connect}
    />
  );
}

/** Mounted once a lesson is complete: runs the `passport` call and swaps the card for the ceremony when there is one. */
export function PassportCeremonyGate(props: GateProps) {
  return (
    <PassportBoundary fallback={props.card}>
      <Gate {...props} />
    </PassportBoundary>
  );
}
