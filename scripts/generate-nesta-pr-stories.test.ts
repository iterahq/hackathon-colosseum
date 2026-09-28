import { describe, expect, it } from 'vitest';
import { loadCsf } from 'storybook/internal/csf-tools';
import { buildGeneratedTitle, readStoryExportNames, renderGeneratedCsf } from './generate-nesta-pr-stories';

describe('buildGeneratedTitle', () => {
  it('keeps only the story name under the PR group', () => {
    expect(buildGeneratedTitle('517', 'Organisms/Activities/8 · Cena/Xray')).toBe(
      'Design Playground/🆕 PR #517/Xray',
    );
  });

  it('adds the parent when two changed stories share a name', () => {
    const taken = new Set<string>();
    expect(buildGeneratedTitle('9', 'Atoms/Live/Card', taken)).toBe('Design Playground/🆕 PR #9/Card');
    expect(buildGeneratedTitle('9', 'Branded/Card', taken)).toBe('Design Playground/🆕 PR #9/Branded · Card');
  });

  it('falls back to the full path when the parent pair also collides', () => {
    const taken = new Set<string>(['Card', 'Live · Card']);
    expect(buildGeneratedTitle('9', 'Molecules/Live/Card', taken)).toBe(
      'Design Playground/🆕 PR #9/Molecules · Live · Card',
    );
  });
});

describe('renderGeneratedCsf', () => {
  const original = [
    "export default { title: 'Organisms/Activities/8 · Cena/Xray', id: 'xray' };",
    'export const Default = { args: { a: 1 } };',
    "export const Solved = { play: async () => {} };",
  ].join('\n');

  it('re-exports every real story by name so the static indexer sees them', () => {
    const names = readStoryExportNames(original, 'src/stories/Xray.stories.tsx');
    const generated = renderGeneratedCsf('../../src/stories/Xray.stories', 'Design Playground/🆕 PR #517/Xray', names);
    const indexed = loadCsf(generated, {
      fileName: '.storybook/generated/pr-517-0-xray.stories.tsx',
      makeTitle: (title) => title ?? 'untitled',
    }).parse().indexInputs;

    expect(indexed.map((input) => input.exportName)).toEqual(names);
    expect(indexed.every((input) => input.title === 'Design Playground/🆕 PR #517/Xray')).toBe(true);
    expect(generated).toContain('id: _originalId');
  });
});
