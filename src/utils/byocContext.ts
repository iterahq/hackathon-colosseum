/**
 * The `build_context` payoff: the prompt the learner assembled by choosing.
 *
 * It is a pure concatenation of what they picked, on purpose — the whole point
 * of the pattern is that the final request is THEIRS, so a model rewriting it
 * into something prettier would take the authorship back.
 */
import type { BuildContextRound } from '@iterahq/activity-spec';
import type { Locale } from '@iterahq/activity-spec/runtime';
import { localizedText } from '@/utils/localizedText';

export type RoundPicks = Record<string, string>;

export function pickedOption(round: BuildContextRound, picks: RoundPicks) {
  const id = picks[round.id];
  return id === undefined ? undefined : round.options.find((o) => o.id === id);
}

export function allRoundsPicked(rounds: readonly BuildContextRound[], picks: RoundPicks): boolean {
  return rounds.every((r) => picks[r.id] !== undefined);
}

export function assembleContext(
  seed: string,
  rounds: readonly BuildContextRound[],
  picks: RoundPicks,
  locale: Locale
): string {
  const parts = rounds
    .map((r) => localizedText(pickedOption(r, picks)?.content, locale).trim())
    .filter((s) => s.length > 0);
  return [seed.trim(), ...parts].filter((s) => s.length > 0).join('\n');
}
