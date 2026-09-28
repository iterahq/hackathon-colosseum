import { describe, expect, it } from 'vitest';
import { buildPrCommentBlock, truncateLines } from './storybook-pr-comment';

const PREVIEW = 'https://pr-517.itera-storybook.pages.dev';

describe('buildPrCommentBlock', () => {
  it('links each affected story to its real built id, split by verdict label', () => {
    const manifest = {
      prNumber: '517',
      affected: [
        {
          path: 'src/stories/Xray.stories.tsx',
          verdict: 'new' as const,
          live: true,
          title: 'Organisms/Activities/8 · Cena/Xray',
          exportNames: ['Default'],
        },
      ],
      maybeAffected: [],
      orphanVisualFiles: [],
      removed: [],
    };
    const index = {
      entries: {
        'organisms-activities-8-·-cena-xray--default': {
          id: 'organisms-activities-8-·-cena-xray--default',
          title: 'Organisms/Activities/8 · Cena/Xray',
          name: 'Default',
          importPath: './src/stories/Xray.stories.tsx',
          type: 'story',
        },
        'nesta-pr-517--docs': {
          id: 'nesta-pr-517--docs',
          title: '🆕 Nesta PR #517',
          name: 'Docs',
          importPath: './.storybook/generated/nesta-pr.mdx',
          type: 'docs',
        },
      },
    };

    const { changedSection: section, depoisUrl } = buildPrCommentBlock(PREVIEW, manifest, index);

    expect(section).toContain(
      `[Organisms/Activities/8 · Cena/Xray — Default](${PREVIEW}/?path=/story/organisms-activities-8-·-cena-xray--default) (nova)`,
    );
    expect(depoisUrl).toBe(`${PREVIEW}/?path=/docs/nesta-pr-517--docs`);
  });

  it('falls back to a plain file reference when the index has no matching story entry', () => {
    const manifest = {
      prNumber: '9',
      affected: [
        {
          path: 'src/stories/Untracked.stories.mdx',
          verdict: 'changed' as const,
          live: true,
          title: null,
          exportNames: [],
        },
      ],
      maybeAffected: [],
      orphanVisualFiles: [],
      removed: [],
    };
    const index = { entries: {} };

    const { changedSection: section, depoisUrl } = buildPrCommentBlock(PREVIEW, manifest, index);

    expect(section).toContain('- `src/stories/Untracked.stories.mdx` (alterada)');
    expect(depoisUrl).toBe(PREVIEW); // no docs entry in the index — falls back to the preview root
  });

  it('lists removed stories in their own block', () => {
    const manifest = {
      prNumber: '9',
      affected: [],
      maybeAffected: [],
      orphanVisualFiles: [],
      removed: ['src/stories/Gone.stories.tsx'],
    };
    const index = { entries: {} };

    const { changedSection: section, depoisUrl } = buildPrCommentBlock(PREVIEW, manifest, index);

    expect(section).toContain('_Nenhuma story nova ou alterada detectada._');
    expect(section).toContain('**Removidas:**');
    expect(section).toContain('- `src/stories/Gone.stories.tsx`');
  });

  it('renders one bullet per exported story when a file has more than one', () => {
    const manifest = {
      prNumber: '9',
      affected: [
        {
          path: 'src/stories/Multi.stories.tsx',
          verdict: 'new' as const,
          live: true,
          title: 'Group/Multi',
          exportNames: ['A', 'B'],
        },
      ],
      maybeAffected: [],
      orphanVisualFiles: [],
      removed: [],
    };
    const index = {
      entries: {
        'group-multi--a': {
          id: 'group-multi--a',
          title: 'Group/Multi',
          name: 'A',
          importPath: './src/stories/Multi.stories.tsx',
          type: 'story',
        },
        'group-multi--b': {
          id: 'group-multi--b',
          title: 'Group/Multi',
          name: 'B',
          importPath: './src/stories/Multi.stories.tsx',
          type: 'story',
        },
      },
    };

    const { changedSection: section, depoisUrl } = buildPrCommentBlock(PREVIEW, manifest, index);

    expect(section).toContain('Group/Multi — A');
    expect(section).toContain('Group/Multi — B');
  });

  it('lists orphan visual files (changed .tsx with no story) up front', () => {
    const manifest = {
      prNumber: '532',
      affected: [],
      maybeAffected: [],
      orphanVisualFiles: ['src/components/live/LessonCompleteCard.tsx'],
      removed: [],
    };
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, manifest, index);

    expect(section).toContain('**⚠️ Mudou mas não tem story:**');
    expect(section).toContain('- `src/components/live/LessonCompleteCard.tsx`');
  });

  it('folds maybeAffected into a collapsed details block, capped, with a +N note', () => {
    const maybeAffected = Array.from({ length: 40 }, (_, i) => `src/stories/Maybe${i}.stories.tsx`);
    const manifest = {
      prNumber: '517',
      affected: [],
      maybeAffected,
      orphanVisualFiles: [],
      removed: [],
    };
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, manifest, index);

    expect(section).toContain('<details>');
    expect(section).toContain('Talvez afetadas');
    expect(section).toContain('- `src/stories/Maybe0.stories.tsx`');
    // Only the first 30 (MAYBE_AFFECTED_CAP) are listed, the rest is a count.
    expect(section).not.toContain('src/stories/Maybe39.stories.tsx');
    expect(section).toContain('_+10 mais_');
  });

  it('truncates a comment body that would exceed the safe char cap, keeping whole lines', () => {
    const affected = Array.from({ length: 5000 }, (_, i) => ({
      path: `src/stories/Huge${i}.stories.tsx`,
      verdict: 'changed' as const,
      live: i < 20,
      title: null,
      exportNames: [],
    }));
    const manifest = {
      prNumber: '517',
      affected,
      maybeAffected: [],
      orphanVisualFiles: [],
      removed: [],
    };
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, manifest, index);

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
    const affected = Array.from({ length: 5000 }, (_, i) => ({
      path: `src/stories/Huge${i}.stories.tsx`,
      verdict: 'changed' as const,
      live: i < 20,
      title: null,
      exportNames: [],
    }));
    const maybeAffected = Array.from({ length: 40 }, (_, i) => `src/stories/Maybe${i}.stories.tsx`);
    const manifest = {
      prNumber: '517',
      affected,
      maybeAffected,
      orphanVisualFiles: [],
      removed: [],
    };
    const index = { entries: {} };

    const { changedSection: section } = buildPrCommentBlock(PREVIEW, manifest, index);

    const opens = (section.match(/<details>/g) ?? []).length;
    const closes = (section.match(/<\/details>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
