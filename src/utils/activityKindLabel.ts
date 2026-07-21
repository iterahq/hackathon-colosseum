const KNOWN_KINDS = new Set([
  'concept',
  'single_choice',
  'multi_choice',
  'match',
  'order',
  'video',
  'sandbox_scenario',
]);

/**
 * i18n key for a human label of an activity kind — so the live sidebar shows
 * "Conceito" instead of the raw `concept` enum. Unknown kinds fall back to a
 * generic "Atividade" rather than leaking a snake_case token to the room.
 */
export function activityKindLabelKey(kind: string): string {
  return KNOWN_KINDS.has(kind) ? `live.kind.${kind}` : 'live.kind.unknown';
}
