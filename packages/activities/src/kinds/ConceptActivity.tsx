/**
 * Concept — a pure READING/exposition activity (plan: ≈ "learning"). Just an
 * InstructionPanel (text/audio/image/video + description, any combo). There is
 * NO "mark done" affordance: a concept is not something the learner completes,
 * it's something they read. Advancing is driven by the SHELL — self-paced
 * (LessonPlayer) shows a "Continuar" that pages forward; in the live class the
 * instructor force-advances the cohort. `onComplete` stays in the prop type for
 * the uniform `ActivityRenderer` dispatch, but the concept never fires it.
 *
 * Mostra a tela inteira de uma vez: conceito é slide. A paginação por `---` saiu
 * em 2026-07-31 e o card "pense antes" virou o kind `concept_reveal`.
 */
import { BookOpen } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { PortableActivity } from '../renderer.js';
import type { ConceptSpec } from '../specs.js';
import { InstructionPanel } from '../components/InstructionPanel.js';
import { ActivityShell } from '../components/parts.js';

export function ConceptActivity({
  activity,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as ConceptSpec;
  return (
    <ActivityShell kind="concept" icon={BookOpen} label={t('activity.concept')}>
      <InstructionPanel spec={spec?.instruction} reading />
    </ActivityShell>
  );
}
