import { describe, it, expect } from 'vitest';
import { hasEditableRegions, isEditAllowed, parseEditableRegions } from '@iterahq/activities/code';

const STARTER = [
  'function BookCard({ title, inStock }) {',
  '  // >>> edite aqui',
  '  const [isFavorite, setIsFavorite] = useState(false);',
  '  // <<<',
  '  return <button>Salvar</button>;',
  '}',
].join('\n');

describe('parseEditableRegions', () => {
  it('opens after the `>>>` line and closes before the `<<<` line', () => {
    expect(parseEditableRegions(STARTER)).toEqual([
      { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 55 },
    ]);
  });

  it('reads the marker through //, /* */ and JSX {/* */} comments alike', () => {
    const jsx = ['<div>', '  {/* >>> */}', '    <b>x</b>', '  {/* <<< */}', '</div>'].join('\n');
    expect(parseEditableRegions(jsx)).toHaveLength(1);
  });

  it('has no regions when the source carries no markers', () => {
    expect(hasEditableRegions('const a = 1;\nexport default a;')).toBe(false);
  });

  // A typo must cost a LOCKED exercise, never a silently open one.
  it('ignores an unbalanced or empty marker pair', () => {
    expect(parseEditableRegions('// >>>\nconst a = 1;')).toEqual([]);
    expect(parseEditableRegions('// >>>\n// <<<')).toEqual([]);
  });

  it('finds every region, not just the first', () => {
    const two = ['// >>>', 'a', '// <<<', 'locked', '// >>>', 'b', '// <<<'].join('\n');
    expect(parseEditableRegions(two).map((r) => r.startLineNumber)).toEqual([2, 6]);
  });
});

describe('isEditAllowed', () => {
  const regions = parseEditableRegions(STARTER);

  it('accepts an edit inside the region, including at both edges', () => {
    expect(
      isEditAllowed(regions, {
        startLineNumber: 3,
        startColumn: 10,
        endLineNumber: 3,
        endColumn: 12,
      }),
    ).toBe(true);
    expect(
      isEditAllowed(regions, { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 1 }),
    ).toBe(true);
    expect(
      isEditAllowed(regions, {
        startLineNumber: 3,
        startColumn: 55,
        endLineNumber: 3,
        endColumn: 55,
      }),
    ).toBe(true);
  });

  it('rejects an edit on the locked code and on the marker lines themselves', () => {
    expect(
      isEditAllowed(regions, { startLineNumber: 5, startColumn: 3, endLineNumber: 5, endColumn: 4 }),
    ).toBe(false);
    expect(
      isEditAllowed(regions, { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 3 }),
    ).toBe(false);
  });

  // Backspacing at column 1 of the first inner line reaches the marker line's
  // end — which is what keeps the learner from deleting the wall itself.
  it('rejects an edit that merely STARTS outside the region', () => {
    expect(
      isEditAllowed(regions, { startLineNumber: 2, startColumn: 8, endLineNumber: 3, endColumn: 1 }),
    ).toBe(false);
  });

  it('lets everything through when the source declares no region', () => {
    expect(
      isEditAllowed([], { startLineNumber: 9, startColumn: 1, endLineNumber: 9, endColumn: 2 }),
    ).toBe(true);
  });
});
