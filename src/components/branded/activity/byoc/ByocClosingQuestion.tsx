/**
 * The question that closes `build_context`, after the rounds and the assembled
 * request.
 *
 * It needs no authored content because its options ARE the learner's own picks
 * — the generated tree has no field for a question after the rounds, and
 * inventing one in i18n would put lesson content in the app. Nothing here is
 * graded: picking re-reveals how that one facet changed the AI's reply.
 */
import { useState } from 'react';
import type { GeneratedOption } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import { ByocPickable } from './ByocPickable';

export function ByocClosingQuestion({
  picks,
}: {
  picks: readonly { roundId: string; option: GeneratedOption }[];
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string>();

  return (
    <div className="mt-6" data-testid="byoc-closing-question">
      <p className="text-foreground">{t('byoc.closingQuestion')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('byoc.noWrongAnswer')}</p>
      <div className="mt-4 grid gap-2.5">
        {picks.map(({ roundId, option }) => (
          <ByocPickable
            key={roundId}
            option={option}
            picked={picked === roundId}
            onPick={() => setPicked(roundId)}
            testId="byoc-closing-option"
          />
        ))}
      </div>
    </div>
  );
}
