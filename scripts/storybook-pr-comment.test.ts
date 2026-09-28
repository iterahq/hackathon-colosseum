import { describe, expect, it } from 'vitest';
import { buildPrCommentBlock, truncateLines } from './storybook-pr-comment';
import type { NestaPrManifest } from './generate-nesta-pr-stories';

const PREVIEW = 'https://pr-517.itera-storybook.pages.dev';

function manifest(overrides: Partial<NestaPrManifest> = {}): NestaPrManifest {
  return {
    prNumber: '517',
    generatedAt: '2026-09-28T00:00:00.000Z',
    generated: [],
    skipped: [],
    maybeAffected: [],
    orphanVisualFiles: [],
    removed: [],
    ...overrides,
  };
}

describe('buildPrCommentBlock', () => {
  it('links each generated story to its real built id, split by verdict label, and opens the first new one', () => {
    const m = manifest({
      generated: [
        {
          path: 'src/stories/Xray.stories.tsx',
          verdict: 'new',
          title: 'Organisms/Activities/8 · Cena/Xray',
          exportNames: ['Default'],
          generatedPath: '.storybook/generated/pr-517-0-xray.stories.tsx',
          generatedTitle: 'Design Playground/🆕 PR #517/Organisms/Activities/8 · Cena/Xray',
        },
      ],
    });
    const index = {
      entries: {
        'design-playground-🆕-pr-517-organisms-activities-8-cena-xray--default': {
          id: 'design-playground-🆕-pr-517-organisms-activities-8-cena-xray--default',
          title: 'Design Playground/🆕 PR #517/Organisms/Activities/8 · Cena/Xray',
          name: 'Default',
          importPath: './.storybook/generated/pr-517-0-xray.stories.tsx',
          type: 'story',
        },
      },
    };

    const { changedSection: section, depoisUrl } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section).toContain(
      `[Organisms/Activities/8 · Cena/Xray — Default](${PREVIEW}/?path=/story/design-playground-🆕-pr-517-organisms-activities-8-cena-xray--default) (nova)`,
    );
    expect(depoisUrl).toBe(
      `${PREVIEW}/?path=/story/design-playground-🆕-pr-517-organisms-activities-8-cena-xray--default`,
    );
  });

  it('falls back to a plain file reference when the index has no matching story entry', () => {
    const m = manifest({
      generated: [
        {
          path: 'src/stories/Untracked.stories.tsx',
          verdict: 'changed',
          title: 'Group/Untracked',
          exportNames: ['Default'],
          generatedPath: '.storybook/generated/pr-9-0-untracked.stories.tsx',
          generatedTitle: 'Design Playground/🆕 PR #9/Group/Untracked',
        },
      ],
    });
    const index = { entries: {} };

    const { changedSection: section, depoisUrl } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section).toContain('- `src/stories/Untracked.stories.tsx` (alterada)');
    expect(depoisUrl).toBe(PREVIEW); // no matching id in the index — falls back to the preview root
  });

  it('falls back to the preview root when nothing was generated', () => {
    const m = manifest();
    const index = { entries: {} };

    const { depoisUrl } = buildPrCommentBlock(PREVIEW, m, index);

    expect(depoisUrl).toBe(PREVIEW);
  });

  it('lists removed stories in their own block', () => {
    const m = manifest({ removed: ['src/stories/Gone.stories.tsx'] });
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section).toContain('_Nenhuma story nova ou alterada detectada._');
    expect(section).toContain('**Removidas:**');
    expect(section).toContain('- `src/stories/Gone.stories.tsx`');
  });

  it('renders one bullet per exported story when a file has more than one', () => {
    const m = manifest({
      generated: [
        {
          path: 'src/stories/Multi.stories.tsx',
          verdict: 'new',
          title: 'Group/Multi',
          exportNames: ['A', 'B'],
          generatedPath: '.storybook/generated/pr-9-0-multi.stories.tsx',
          generatedTitle: 'Design Playground/🆕 PR #9/Group/Multi',
        },
      ],
    });
    const index = {
      entries: {
        'design-playground-pr-9-group-multi--a': {
          id: 'design-playground-pr-9-group-multi--a',
          title: 'Design Playground/🆕 PR #9/Group/Multi',
          name: 'A',
          importPath: './.storybook/generated/pr-9-0-multi.stories.tsx',
          type: 'story',
        },
        'design-playground-pr-9-group-multi--b': {
          id: 'design-playground-pr-9-group-multi--b',
          title: 'Design Playground/🆕 PR #9/Group/Multi',
          name: 'B',
          importPath: './.storybook/generated/pr-9-0-multi.stories.tsx',
          type: 'story',
        },
      },
    };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section).toContain('Group/Multi — A');
    expect(section).toContain('Group/Multi — B');
  });

  it('lists orphan visual files (changed .tsx with no story) up front', () => {
    const m = manifest({ orphanVisualFiles: ['src/components/live/LessonCompleteCard.tsx'] });
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section).toContain('**⚠️ Mudou mas não tem story:**');
    expect(section).toContain('- `src/components/live/LessonCompleteCard.tsx`');
  });

  it('lists skipped (non-reexportable) stories with their reason', () => {
    const m = manifest({
      skipped: [
        { path: 'src/stories/Weird.stories.mdx', verdict: 'changed', reason: 'mdx' },
        { path: 'src/stories/NoTitle.stories.tsx', verdict: 'new', reason: 'no-default-export' },
      ],
    });
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section).toContain('**⚠️ Não deu pra gerar preview ao vivo:**');
    expect(section).toContain('- `src/stories/Weird.stories.mdx`');
    expect(section).toContain('- `src/stories/NoTitle.stories.tsx`');
  });

  it('folds maybeAffected into a collapsed details block, capped, with a +N note', () => {
    const maybeAffected = Array.from({ length: 40 }, (_, i) => `src/stories/Maybe${i}.stories.tsx`);
    const m = manifest({ maybeAffected });
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section).toContain('<details>');
    expect(section).toContain('Talvez afetadas');
    expect(section).toContain('- `src/stories/Maybe0.stories.tsx`');
    // Only the first 30 (MAYBE_AFFECTED_CAP) are listed, the rest is a count.
    expect(section).not.toContain('src/stories/Maybe39.stories.tsx');
    expect(section).toContain('_+10 mais_');
  });

  it('truncates a comment body that would exceed the safe char cap, keeping whole lines', () => {
    const generated = Array.from({ length: 5000 }, (_, i) => ({
      path: `src/stories/Huge${i}.stories.tsx`,
      verdict: 'changed' as const,
      title: `Group/Huge${i}`,
      exportNames: [],
      generatedPath: `.storybook/generated/pr-517-${i}-huge.stories.tsx`,
      generatedTitle: `Design Playground/🆕 PR #517/Group/Huge${i}`,
    }));
    const m = manifest({ generated });
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, m, index);

    expect(section.length).toBeLessThan(65536);
    expect(section).toMatch(/linha(s)? a mais no preview completo/);
    // No dangling partial markdown line at the cut point.
    expect(section.trimEnd().split('\n').at(-1)).toMatch(/^_\+\d+ linhas? a mais/);
  });

  it('closes a `<details>` block left open by a mid-section truncation', () => {
    // The cap lands after `<details>` opens but before the matching
    // `</details>` — without the fix this would leave a dangling open tag
    // and blockquote the rest of the GitHub comment as collapsed content.
    const lines = [
      'before',
      '<details><summary>Talvez afetadas</summary>',
      '',
      '- `src/stories/Maybe0.stories.tsx`',
      '- `src/stories/Maybe1.stories.tsx`',
      '- `src/stories/Maybe2.stories.tsx`',
      '',
      '</details>',
      'after',
    ];
    // Cap right after the 4th line (mid-`<details>`, well before its close).
    const capChars = lines.slice(0, 4).reduce((sum, l) => sum + l.length + 1, 0) + 1;

    const result = truncateLines(lines, capChars);

    expect(result.slice(0, 4)).toEqual(lines.slice(0, 4));
    expect(result).toContain('</details>');
    expect(result).not.toContain('after');
    const opens = result.filter((l) => l.trim().startsWith('<details>')).length;
    const closes = result.filter((l) => l.trim().startsWith('</details>')).length;
    expect(opens).toBe(closes);
  });

  it('does not add a stray `</details>` when nothing was left open at the cut point', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    const capChars = lines.slice(0, 2).reduce((sum, l) => sum + l.length + 1, 0) + 1;

    const result = truncateLines(lines, capChars);

    expect(result).not.toContain('</details>');
  });

  it('closes a `<details>` block left open by mid-section truncation in the full comment', () => {
    // Enough "changed" entries to blow the char cap on their own, followed
    // by a `maybeAffected` block that opens `<details>` — the truncation
    // point lands inside it, before the matching `</details>`.
    const generated = Array.from({ length: 5000 }, (_, i) => ({
      path: `src/stories/Huge${i}.stories.tsx`,
      verdict: 'changed' as const,
      title: `Group/Huge${i}`,
      exportNames: [],
      generatedPath: `.storybook/generated/pr-517-${i}-huge.stories.tsx`,
      generatedTitle: `Design Playground/🆕 PR #517/Group/Huge${i}`,
    }));
    const maybeAffected = Array.from({ length: 40 }, (_, i) => `src/stories/Maybe${i}.stories.tsx`);
    const m = manifest({ generated, maybeAffected });
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, m, index);

    const opens = (section.match(/<details>/g) ?? []).length;
    const closes = (section.match(/<\/details>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
