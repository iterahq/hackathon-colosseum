/**
 * One option the learner can still choose in a round with no answer key.
 *
 * Identity is the CALLER's key, never `option.id`: ids are unique inside a
 * round, and the closing question lines up one option from EACH round, where
 * comparing by `option.id` selected all of them at once.
 */
import type { GeneratedOption } from '@iterahq/activity-spec';
import { BYOC_PICKABLE_HOVER } from '@/consts/byocTone';
import { ByocOptionCard } from './ByocOptionCard';

export function ByocPickable({
  option,
  picked,
  onPick,
  testId,
}: {
  option: GeneratedOption;
  picked: boolean;
  onPick: () => void;
  testId: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPick();
      }}
      className="cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azul-hi"
      data-testid={testId}
      data-selected={picked ? 'true' : undefined}
    >
      <ByocOptionCard
        option={option}
        tone={picked ? 'picked' : 'neutral'}
        revealResponse={picked}
        className={picked ? '' : BYOC_PICKABLE_HOVER}
      />
    </div>
  );
}
