/**
 * BYOC step 2 — answer the generated tree.
 *
 * The dispatch is a switch and not a boolean on purpose: a pattern added to
 * `GeneratedChoiceTree` that nobody wires here has to fail `npm run typecheck`,
 * rather than fall through to whichever branch happened to be the `else`.
 */
import type { GeneratedChoiceTree } from '@iterahq/activity-spec';
import type { ActivityCompleteDetail } from '../activityFeedbackKinds';
import { ByocGradedTree } from './ByocGradedTree';
import { ByocRounds } from './ByocRounds';

export function ByocTree({
  tree,
  seed = '',
  reveal = false,
  done = false,
  onComplete,
}: {
  tree: GeneratedChoiceTree;
  /** The learner's free text — only `build_context` uses it, as the first line. */
  seed?: string;
  reveal?: boolean;
  /** Already completed in an earlier session — render locked, not answerable. */
  done?: boolean;
  onComplete: (correct: boolean, detail?: ActivityCompleteDetail) => void;
}) {
  switch (tree.interaction) {
    case 'build_context':
      return <ByocRounds tree={tree} seed={seed} done={done} onComplete={onComplete} />;
    case 'pick_best':
    case 'judge_each':
      return <ByocGradedTree tree={tree} reveal={reveal} done={done} onComplete={onComplete} />;
  }
}
