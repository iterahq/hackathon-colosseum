import { describe, expect, it } from 'vitest';
import { safeParseKindSpec } from '@iterahq/activities';
import { withSealedPlaceholders } from '@/utils/sealedSpec';

const STARTER = `export default function Club() {
  const [likes, {{blank:setter}}] = useState({{blank:initial}});
  return <button onClick={() => setLikes(likes + 1)}>Like {likes}</button>;
}
`;

const SERVED = {
  single_choice: {
    instruction: { text: 'Which structure avoids duplicating data?' },
    options: [
      { id: 'a', label: 'Copy the columns' },
      { id: 'b', label: 'Use a foreign key' },
      { id: 'c', label: 'Duplicate the table' },
    ],
  },
  multi_choice: {
    instruction: { text: 'Which are good modelling practices?' },
    options: [
      { id: 'a', label: 'Normalize' },
      { id: 'b', label: 'Use foreign keys' },
      { id: 'c', label: 'Copy data everywhere' },
    ],
  },
  order: {
    instruction: { text: 'Order the modelling steps.' },
    items: [
      { id: 's3', label: '3. Normalize' },
      { id: 's1', label: '1. Find entities' },
      { id: 's2', label: '2. List attributes' },
    ],
  },
  match: {
    instruction: { text: 'Match each term.' },
    left: [
      { id: 'pk', label: 'Primary key' },
      { id: 'fk', label: 'Foreign key' },
      { id: 'idx', label: 'Index' },
    ],
    right: [
      { id: 'r-idx', label: 'Speeds up lookups' },
      { id: 'r-pk', label: 'Identifies a row' },
      { id: 'r-fk', label: 'References another PK' },
    ],
  },
  code_fill_type: {
    prompt: 'Write what is missing.',
    starter: STARTER,
    language: 'tsx',
    blanks: [
      { id: 'setter', kind: 'text', placeholder: 'setSomething', hint: 'The button already calls it.' },
      { id: 'initial', kind: 'text', placeholder: '?', hint: 'Nobody liked yet.' },
    ],
  },
  code_fill_bank: {
    prompt: 'Place the two missing words.',
    starter: `const [n, setN] = {{blank:hook}}(0);\n<button {{blank:event}}={() => setN(n + 1)} />`,
    language: 'tsx',
    word_bank: ['useState', 'onClick', 'useEffect', 'onChange'],
    blanks: [
      { id: 'hook', kind: 'bank', hint: 'State hook.' },
      { id: 'event', kind: 'bank', hint: 'A click.' },
    ],
  },
  code_fill_select: {
    prompt: 'Pick the option that makes the counter work.',
    starter: `const [n, setN] = {{blank:hook}}(0);\n<button {{blank:event}}={() => setN(n + 1)} />`,
    language: 'tsx',
    blanks: [
      { id: 'hook', kind: 'select', options: ['useState', 'useEffect', 'useMemo'], hint: 'State.' },
      { id: 'event', kind: 'select', options: ['onClick', 'onChange', 'onSubmit'], hint: 'Click.' },
    ],
  },
  code_editor_checks: {
    prompt: 'Add a title and a like button.',
    starter: 'export default function App() { return <div /> }',
    language: 'tsx',
    checks: [
      { id: 'title', label: 'The screen has a title', hint: 'Use an h1.' },
      { id: 'button', label: 'There is a like button', hint: 'Use a button.' },
    ],
  },
} as const;

const PAIR_COUNT: Record<string, number> = { match: 3 };

describe('withSealedPlaceholders', () => {
  for (const [kind, spec] of Object.entries(SERVED)) {
    it(`${kind}: a spec served without its answers validates once filled`, () => {
      const raw = safeParseKindSpec(kind as never, spec);
      const filled = withSealedPlaceholders(kind, spec as never, PAIR_COUNT[kind] ?? 0);
      const parsed = safeParseKindSpec(kind as never, filled);
      expect(parsed.success).toBe(true);
      expect(raw.success).toBe(false);
    });
  }

  it('does not mutate the spec it was given', () => {
    const before = JSON.stringify(SERVED.single_choice);
    withSealedPlaceholders('single_choice', SERVED.single_choice as never);
    expect(JSON.stringify(SERVED.single_choice)).toBe(before);
  });

  it('leaves a kind it does not seal untouched', () => {
    const spec = { prompt: 'x' };
    expect(withSealedPlaceholders('document_read', spec)).toBe(spec);
  });

  it('keeps the placeholders inert: no placeholder is a real answer to a fill blank', () => {
    const filled = withSealedPlaceholders('code_fill_type', SERVED.code_fill_type as never) as {
      blanks: Array<{ answer: string; accept?: unknown }>;
    };
    for (const blank of filled.blanks) {
      expect(blank.answer).toBe('—');
      expect(blank.accept).toBeUndefined();
    }
  });

  it('claims at most the pair count the server announced for a match', () => {
    const filled = withSealedPlaceholders('match', SERVED.match as never, 2) as { pairs: unknown[] };
    expect(filled.pairs).toHaveLength(2);
  });
});
