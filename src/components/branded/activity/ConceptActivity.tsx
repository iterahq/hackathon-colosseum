/**
 * Concept — a pure READING/exposition activity (plan: ≈ "learning"). Just an
 * InstructionPanel (text/audio/image/video + description, any combo). There is
 * NO "mark done" affordance: a concept is not something the learner completes,
 * it's something they read. Advancing is driven by the SHELL — self-paced
 * (LessonPlayer) shows a "Continuar" that pages forward; in the live class the
 * instructor force-advances the cohort. `onComplete` stays in the prop type for
 * the uniform `ActivityRenderer` dispatch, but the concept never fires it.
 *
 * O passo a passo do texto (`stepped`) só existe self-paced: ao vivo quem dita o
 * ritmo é o professor falando, e revelação por aluno dessincronizaria a turma.
 */
import { BookOpen } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ConceptSpec } from '@/types/content';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell } from './parts';

export function ConceptActivity({
  activity,
  live = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  live?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as ConceptSpec;
  return (
    <ActivityShell kind="concept" icon={BookOpen} label={t('activity.concept')}>
      <InstructionPanel spec={spec?.instruction} stepped={!live} />
    </ActivityShell>
  );
}
