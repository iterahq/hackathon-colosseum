import { describe, expect, it } from 'vitest';
import {
  CANVAS_CAP,
  detectChangedStories,
  parseGitDiffNameStatus,
  type ChangedFile,
  type RepoFs,
} from './storybook-changed-stories';

/** In-memory RepoFs so the traversal never touches the real filesystem. */
function makeFs(files: Record<string, string>): RepoFs {
  return {
    exists: (path) => path in files,
    readFile: (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path];
    },
    listFiles: (dir) => {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      return Object.keys(files).filter((p) => p.startsWith(prefix));
    },
  };
}

describe('parseGitDiffNameStatus', () => {
  it('parses added, modified and deleted lines', () => {
    const output = [
      'A\tsrc/stories/New.stories.tsx',
      'M\tsrc/components/Widget.tsx',
      'D\tsrc/stories/Old.stories.tsx',
    ].join('\n');
    expect(parseGitDiffNameStatus(output)).toEqual<ChangedFile[]>([
      { status: 'A', path: 'src/stories/New.stories.tsx' },
      { status: 'M', path: 'src/components/Widget.tsx' },
      { status: 'D', path: 'src/stories/Old.stories.tsx' },
    ]);
  });

  it('keeps the new path on a rename and reports it as "R"', () => {
    const output = 'R100\tsrc/old/Name.tsx\tsrc/new/Name.tsx';
    expect(parseGitDiffNameStatus(output)).toEqual<ChangedFile[]>([
      { status: 'R', path: 'src/new/Name.tsx' },
    ]);
  });

  it('ignores blank lines', () => {
    expect(parseGitDiffNameStatus('\n\nM\tsrc/x.ts\n\n')).toEqual<ChangedFile[]>([
      { status: 'M', path: 'src/x.ts' },
    ]);
  });
});

describe('detectChangedStories', () => {
  it('marks an added story file as "new" and live', () => {
    const fs = makeFs({
      'src/stories/New.stories.tsx': `export default { title: 'New' };`,
    });
    const result = detectChangedStories(
      [{ status: 'A', path: 'src/stories/New.stories.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([
      { path: 'src/stories/New.stories.tsx', verdict: 'new', live: true },
    ]);
    expect(result.removed).toEqual([]);
    expect(result.maybeAffected).toEqual([]);
    expect(result.orphanVisualFiles).toEqual([]);
  });

  it('marks a directly modified story file as "changed" and live', () => {
    const fs = makeFs({
      'src/stories/Existing.stories.tsx': `export default { title: 'Existing' };`,
    });
    const result = detectChangedStories(
      [{ status: 'M', path: 'src/stories/Existing.stories.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([
      { path: 'src/stories/Existing.stories.tsx', verdict: 'changed', live: true },
    ]);
  });

  it('lists a removed story file separately, not as affected', () => {
    const fs = makeFs({});
    const result = detectChangedStories(
      [{ status: 'D', path: 'src/stories/Gone.stories.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([]);
    expect(result.removed).toEqual(['src/stories/Gone.stories.tsx']);
  });

  it('marks a story "changed" and live when it directly imports a changed component', () => {
    const fs = makeFs({
      'src/components/Widget.tsx': `export const Widget = () => null;`,
      'src/stories/Widget.stories.tsx': `
        import { Widget } from '@/components/Widget';
        export default { title: 'Widget' };
      `,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/components/Widget.tsx' }], fs);
    expect(result.affected).toEqual([
      { path: 'src/stories/Widget.stories.tsx', verdict: 'changed', live: true },
    ]);
    expect(result.maybeAffected).toEqual([]);
  });

  it('does NOT treat a transitive (2+ hop) chain as a live direct hit — it lands in maybeAffected', () => {
    const fs = makeFs({
      'src/components/deep/Leaf.tsx': `export const Leaf = () => null;`,
      'src/components/Mid.tsx': `
        import { Leaf } from './deep/Leaf';
        export const Mid = () => Leaf;
      `,
      'src/components/Widget.tsx': `
        import { Mid } from './Mid';
        export const Widget = () => Mid;
      `,
      'src/stories/Widget.stories.tsx': `
        import { Widget } from '@/components/Widget';
        export default { title: 'Widget' };
      `,
    });
    const result = detectChangedStories(
      [{ status: 'M', path: 'src/components/deep/Leaf.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([]);
    expect(result.maybeAffected).toEqual(['src/stories/Widget.stories.tsx']);
  });

  it('does not mark an unrelated story as affected', () => {
    const fs = makeFs({
      'src/components/Widget.tsx': `export const Widget = () => null;`,
      'src/components/Other.tsx': `export const Other = () => null;`,
      'src/stories/Widget.stories.tsx': `
        import { Widget } from '@/components/Widget';
        export default { title: 'Widget' };
      `,
      'src/stories/Other.stories.tsx': `
        import { Other } from '@/components/Other';
        export default { title: 'Other' };
      `,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/components/Widget.tsx' }], fs);
    expect(result.affected).toEqual([
      { path: 'src/stories/Widget.stories.tsx', verdict: 'changed', live: true },
    ]);
  });

  it('treats a whole-package alias (@iterahq/<pkg>) as maybeAffected, not live — too coarse', () => {
    const fs = makeFs({
      'packages/activities/package.json': JSON.stringify({ name: '@iterahq/activities' }),
      'packages/activities/src/Kind.tsx': `export const Kind = () => null;`,
      'src/stories/Activity.stories.tsx': `
        import { Kind } from '@iterahq/activities';
        export default { title: 'Activity' };
      `,
    });
    const result = detectChangedStories(
      [{ status: 'M', path: 'packages/activities/src/Kind.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([]);
    expect(result.maybeAffected).toEqual(['src/stories/Activity.stories.tsx']);
  });

  it('does not chase an import outside src/, packages/ or design-playground/', () => {
    const fs = makeFs({
      'src/stories/External.stories.tsx': `
        import { useEffect } from 'react';
        export default { title: 'External' };
      `,
    });
    const result = detectChangedStories(
      [{ status: 'M', path: 'src/stories/External.stories.tsx' }],
      fs,
    );
    // Direct-change pass still marks the story file itself — this asserts the
    // external import didn't throw or loop, not that it's ignored entirely.
    expect(result.affected).toEqual([
      { path: 'src/stories/External.stories.tsx', verdict: 'changed', live: true },
    ]);
  });

  it('stops at MAX_IMPORT_DEPTH instead of hanging on a long chain', () => {
    const files: Record<string, string> = {
      'src/stories/Chain.stories.tsx': `
        import { X } from '@/chain/n0';
        export default { title: 'Chain' };
      `,
    };
    const depth = 20;
    for (let i = 0; i < depth; i++) {
      files[`src/chain/n${i}.tsx`] =
        i === depth - 1
          ? `export const X = 1;`
          : `import { X } from './n${i + 1}'; export { X };`;
    }
    const fs = makeFs(files);
    const result = detectChangedStories(
      [{ status: 'M', path: `src/chain/n${depth - 1}.tsx` }],
      fs,
    );
    // The changed file sits past MAX_IMPORT_DEPTH hops from the story — not found anywhere.
    expect(result.affected).toEqual([]);
    expect(result.maybeAffected).toEqual([]);
  });

  it('ignores a cyclical import instead of looping forever', () => {
    const fs = makeFs({
      'src/components/A.tsx': `import { b } from './B'; export const a = b;`,
      'src/components/B.tsx': `import { a } from './A'; export const b = a;`,
      'src/stories/Cycle.stories.tsx': `
        import { a } from '@/components/A';
        export default { title: 'Cycle' };
      `,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/components/B.tsx' }], fs);
    expect(result.maybeAffected).toEqual(['src/stories/Cycle.stories.tsx']);
  });

  it('returns nothing affected when no watched source or story file changed', () => {
    const fs = makeFs({
      'src/stories/Widget.stories.tsx': `export default { title: 'Widget' };`,
    });
    const result = detectChangedStories([{ status: 'M', path: 'README.md' }], fs);
    expect(result.affected).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.maybeAffected).toEqual([]);
    expect(result.orphanVisualFiles).toEqual([]);
  });

  it('ignores hub files (barrel index, i18n, fixtures, types, utils) in the direct pass', () => {
    const fs = makeFs({
      'src/i18n/index.ts': `export const t = {};`,
      'src/utils/format.ts': `export const format = (x: unknown) => x;`,
      'src/stories/contractFixtures.ts': `export const fixture = {};`,
      'src/components/Widget.tsx': `
        import { t } from '../i18n';
        import { format } from '../utils/format';
        import { fixture } from '../stories/contractFixtures';
        export const Widget = () => null;
      `,
      'src/stories/Widget.stories.tsx': `
        import { Widget } from '@/components/Widget';
        export default { title: 'Widget' };
      `,
    });
    const result = detectChangedStories(
      [
        { status: 'M', path: 'src/i18n/index.ts' },
        { status: 'M', path: 'src/utils/format.ts' },
        { status: 'M', path: 'src/stories/contractFixtures.ts' },
      ],
      fs,
    );
    // None of these hub files is a DIRECT target of Widget.stories.tsx
    // itself (Widget.stories.tsx imports Widget.tsx, not the hubs), so this
    // asserts the hub exclusion applies to Widget.tsx's own direct pass —
    // covered by the next test. Here we just confirm hub-only changes don't
    // spuriously mark an unrelated story live.
    expect(result.affected).toEqual([]);
  });

  it('does not treat a story that imports a hub file directly as a live direct hit', () => {
    const fs = makeFs({
      'src/i18n/index.ts': `export const t = {};`,
      'src/stories/HubConsumer.stories.tsx': `
        import { t } from '../i18n';
        export default { title: 'HubConsumer' };
      `,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/i18n/index.ts' }], fs);
    expect(result.affected).toEqual([]);
    expect(result.maybeAffected).toEqual(['src/stories/HubConsumer.stories.tsx']);
  });

  it('caps live CANVASES (not story files) at CANVAS_CAP across new stories, marking the overflow non-live', () => {
    const files: Record<string, string> = {};
    const storyCount = CANVAS_CAP + 5; // one export each -> one canvas each
    for (let i = 0; i < storyCount; i++) {
      files[`src/stories/Widget${i}.stories.tsx`] = `
        export default { title: 'Widget${i}' };
        export const Default = {};
      `;
    }
    const fs = makeFs(files);
    const changedFiles: ChangedFile[] = Object.keys(files).map((path) => ({
      status: 'A' as const,
      path,
    }));
    const result = detectChangedStories(changedFiles, fs);
    expect(result.affected).toHaveLength(storyCount);
    expect(result.affected.filter((s) => s.live)).toHaveLength(CANVAS_CAP);
    expect(result.affected.filter((s) => !s.live)).toHaveLength(storyCount - CANVAS_CAP);
  });

  it('does not spend the canvas budget on a story with zero exports', () => {
    const fs = makeFs({
      'src/stories/NoExports.stories.tsx': `export default { title: 'NoExports' };`,
    });
    const result = detectChangedStories(
      [{ status: 'A', path: 'src/stories/NoExports.stories.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([
      { path: 'src/stories/NoExports.stories.tsx', verdict: 'new', live: true },
    ]);
  });

  it('prioritizes new stories over changed ones for the canvas budget', () => {
    const files: Record<string, string> = {
      'src/components/Widget.tsx': `export const Widget = () => null;`,
      'src/stories/Widget.stories.tsx': `
        import { Widget } from '@/components/Widget';
        export default { title: 'Widget' };
        ${Array.from({ length: CANVAS_CAP }, (_, i) => `export const S${i} = {};`).join('\n')}
      `,
    };
    // A single new story that alone eats the whole budget.
    files['src/stories/NewBig.stories.tsx'] = `
      export default { title: 'NewBig' };
      ${Array.from({ length: CANVAS_CAP }, (_, i) => `export const N${i} = {};`).join('\n')}
    `;
    const fs = makeFs(files);
    const result = detectChangedStories(
      [
        { status: 'A', path: 'src/stories/NewBig.stories.tsx' },
        { status: 'M', path: 'src/components/Widget.tsx' },
      ],
      fs,
    );
    const newEntry = result.affected.find((s) => s.path === 'src/stories/NewBig.stories.tsx');
    const changedEntry = result.affected.find((s) => s.path === 'src/stories/Widget.stories.tsx');
    expect(newEntry).toEqual({ path: 'src/stories/NewBig.stories.tsx', verdict: 'new', live: true });
    expect(changedEntry).toEqual({
      path: 'src/stories/Widget.stories.tsx',
      verdict: 'changed',
      live: false,
    });
  });

  it('does not promote a story/test HELPER file (src/stories/** non-story) to a live direct hit', () => {
    const fs = makeFs({
      'src/stories/interactions.ts': `export const clickThrough = () => {};`,
      'src/stories/Consumer.stories.tsx': `
        import { clickThrough } from './interactions';
        export default { title: 'Consumer' };
      `,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/stories/interactions.ts' }], fs);
    expect(result.affected).toEqual([]);
    expect(result.maybeAffected).toEqual(['src/stories/Consumer.stories.tsx']);
  });

  it('only promotes a dispatcher component\'s OWN story, not every story that renders through it', () => {
    const fs = makeFs({
      'src/components/ActivityRenderer.tsx': `export const ActivityRenderer = () => null;`,
      'src/stories/ActivityRenderer.stories.tsx': `
        import { ActivityRenderer } from '@/components/ActivityRenderer';
        export default { title: 'ActivityRenderer', component: ActivityRenderer };
      `,
      // Real shape from PR #517: the story is titled/about "DiagramActivity"
      // but has no DiagramActivity.tsx import at all — it renders through
      // ActivityRenderer and even declares it as `component:` for
      // Storybook's controls/docgen. Basename doesn't match, and the meta
      // `component:` target is claimed elsewhere (by ActivityRenderer's own
      // story) — this must NOT promote.
      'src/stories/DiagramActivity.stories.tsx': `
        import { ActivityRenderer } from '@/components/ActivityRenderer';
        export default { title: 'DiagramActivity', component: ActivityRenderer };
      `,
    });
    const result = detectChangedStories(
      [{ status: 'M', path: 'src/components/ActivityRenderer.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([
      { path: 'src/stories/ActivityRenderer.stories.tsx', verdict: 'changed', live: true },
    ]);
    expect(result.maybeAffected).toEqual(['src/stories/DiagramActivity.stories.tsx']);
  });

  it('resolves the meta `component:` identifier even when it does not match the story basename', () => {
    const fs = makeFs({
      'src/components/Widget.tsx': `export const Widget = () => null;`,
      'src/stories/CustomTitle.stories.tsx': `
        import { Widget } from '@/components/Widget';
        export default { title: 'CustomTitle', component: Widget };
      `,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/components/Widget.tsx' }], fs);
    expect(result.affected).toEqual([
      { path: 'src/stories/CustomTitle.stories.tsx', verdict: 'changed', live: true },
    ]);
  });

  it('reports a changed .tsx with no story as an orphan visual file', () => {
    const fs = makeFs({
      'src/components/LessonCompleteCard.tsx': `export const LessonCompleteCard = () => null;`,
    });
    const result = detectChangedStories(
      [{ status: 'M', path: 'src/components/LessonCompleteCard.tsx' }],
      fs,
    );
    expect(result.affected).toEqual([]);
    expect(result.orphanVisualFiles).toEqual(['src/components/LessonCompleteCard.tsx']);
  });

  it('does not flag a changed .tsx as orphan when a story imports it directly', () => {
    const fs = makeFs({
      'src/components/Widget.tsx': `export const Widget = () => null;`,
      'src/stories/Widget.stories.tsx': `
        import { Widget } from '@/components/Widget';
        export default { title: 'Widget' };
      `,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/components/Widget.tsx' }], fs);
    expect(result.orphanVisualFiles).toEqual([]);
  });

  it('does not flag a non-.tsx changed file as orphan', () => {
    const fs = makeFs({
      'src/utils/helper.ts': `export const helper = () => null;`,
    });
    const result = detectChangedStories([{ status: 'M', path: 'src/utils/helper.ts' }], fs);
    expect(result.orphanVisualFiles).toEqual([]);
  });

  it('does not flag a changed *.test.tsx / *.spec.tsx as an orphan visual file — it is a test, not a component', () => {
    const fs = makeFs({
      'src/components/Widget.test.tsx': `test('it works', () => {});`,
      'src/components/Widget.spec.tsx': `test('it also works', () => {});`,
    });
    const result = detectChangedStories(
      [
        { status: 'M', path: 'src/components/Widget.test.tsx' },
        { status: 'M', path: 'src/components/Widget.spec.tsx' },
      ],
      fs,
    );
    expect(result.orphanVisualFiles).toEqual([]);
  });
});
