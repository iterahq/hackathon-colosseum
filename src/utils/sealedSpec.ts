/**
 * A sealed activity arrives without its answer fields (the `lesson` function
 * removes them), and the spec schemas require those fields. This puts an inert
 * value in each place so the spec still validates. No sealed kind reads them:
 * the verdict and the key come from the server's judge.
 */
type Json = Record<string, unknown>;

const objects = (value: unknown): Json[] =>
  Array.isArray(value) ? value.filter((item): item is Json => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
const ids = (value: unknown): string[] => objects(value).map((item) => item.id).filter((id): id is string => typeof id === 'string');
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : []);

const TYPED_PLACEHOLDER = '—';

function fillPlaceholders(spec: Json): Json {
  const bank = [...new Set(strings(spec.word_bank))];
  const blanks = objects(spec.blanks).map((blank) => {
    if (blank.kind === 'bank') return { ...blank, answer: bank[0] ?? TYPED_PLACEHOLDER };
    if (blank.kind === 'select') {
      const options = [...new Set(strings(blank.options))];
      return { ...blank, answer: options[0] ?? TYPED_PLACEHOLDER, options };
    }
    return { ...blank, answer: TYPED_PLACEHOLDER };
  });
  return { ...spec, blanks, ...(bank.length > 0 ? { word_bank: bank } : {}) };
}

export function withSealedPlaceholders(kind: string, spec: Json, pairCount = 0): Json {
  if (kind === 'single_choice') return { ...spec, correct_option_id: ids(spec.options)[0] ?? '' };
  if (kind === 'multi_choice') return { ...spec, correct_option_ids: ids(spec.options).slice(0, 1) };
  if (kind === 'order') return { ...spec, correct_order: ids(spec.items) };
  if (kind === 'match') {
    const left = ids(spec.left);
    const right = ids(spec.right);
    const count = Math.max(1, Math.min(pairCount || left.length, left.length, right.length));
    return { ...spec, pairs: left.slice(0, count).map((leftId, index) => ({ left_id: leftId, right_id: right[index] })) };
  }
  if (kind === 'code_fill_type' || kind === 'code_fill_bank' || kind === 'code_fill_select') return fillPlaceholders(spec);
  if (kind === 'code_editor_checks') {
    return { ...spec, checks: objects(spec.checks).map((check) => ({ ...check, selector: 'html', assert: { type: 'exists' } })) };
  }
  return spec;
}
