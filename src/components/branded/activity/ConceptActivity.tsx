/**
 * Concept — a no-action display activity (plan: ≈ "learning"). Just an
 * InstructionPanel (text/audio/image/video + description, any combo) plus a
 * "mark done" affordance. Non-interactive → always completes correct.
 */
import { BookOpen } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ConceptSpec } from '@/types/content';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, DoneButton } from './parts';

export function ConceptActivity({
  activity,
  onComplete,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as ConceptSpec;
  const isDone = activity.status === 'done';
  return (
    <ActivityShell kind="concept" icon={BookOpen} label={t('activity.concept')}>
      <InstructionPanel spec={spec?.instruction} />
      <DoneButton done={isDone} onClick={() => onComplete(true)} />
    </ActivityShell>
  );
}
