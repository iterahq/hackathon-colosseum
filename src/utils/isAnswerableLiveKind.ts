/**
 * Which activity kinds HAVE an answer in a live class. Content kinds (concept,
 * video, document, diagram) have nothing to reveal, so instructor controls tied
 * to an answer (Reveal) must hide for them.
 */
const ANSWERABLE_KINDS: ReadonlySet<string> = new Set([
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'quiz',
  'code',
  'sandbox_scenario',
]);

export function isAnswerableLiveKind(kind: string | null | undefined): boolean {
  return !!kind && ANSWERABLE_KINDS.has(kind);
}
