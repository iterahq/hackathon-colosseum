import { describe, expect, it } from 'vitest';
import { parseStoryFileMeta } from './storybook-story-meta';

describe('parseStoryFileMeta', () => {
  it('extracts the title from a single-line default export meta object', () => {
    const source = `
      import type { Meta } from '@storybook/react';
      export default {
        title: 'Activities/BYOC/byoc_pick_best',
        component: ByocPickBestActivity,
      };
      export const Default = { args: {} };
      export const Empty = { args: { items: [] } };
    `;
    expect(parseStoryFileMeta(source)).toEqual({
      title: 'Activities/BYOC/byoc_pick_best',
      explicitId: undefined,
      componentIdentifier: 'ByocPickBestActivity',
      exportNames: ['Default', 'Empty'],
    });
  });

  it('extracts the title when the meta object spans multiple lines', () => {
    const source = `
      export default {
        title: 'Organisms/Activities/8 · Cena/Xray',
        parameters: { layout: 'fullscreen' },
      } satisfies Meta<typeof Xray>;

      export const Playing: StoryObj = {};
    `;
    expect(parseStoryFileMeta(source)).toEqual({
      title: 'Organisms/Activities/8 · Cena/Xray',
      explicitId: undefined,
      componentIdentifier: undefined,
      exportNames: ['Playing'],
    });
  });

  it('handles the "const meta = {...}; export default meta;" shape and an explicit id', () => {
    const source = `
      const meta = {
        title: 'Organisms/Activities/0 · Dispatcher (todos os contratos)',
        id: 'activities-dispatcher',
        component: ActivityRenderer,
        decorators: [withActivityWidth],
      };
      export default meta;
      type Story = StoryObj<typeof ActivityRenderer>;

      export const Exposicao: Story = {};
    `;
    expect(parseStoryFileMeta(source)).toEqual({
      title: 'Organisms/Activities/0 · Dispatcher (todos os contratos)',
      explicitId: 'activities-dispatcher',
      componentIdentifier: 'ActivityRenderer',
      exportNames: ['Exposicao'],
    });
  });

  it('returns an undefined title and no exports for a file with neither', () => {
    expect(parseStoryFileMeta('export const helper = () => null;')).toEqual({
      title: undefined,
      explicitId: undefined,
      componentIdentifier: undefined,
      exportNames: ['helper'],
    });
  });

  it('does not pick up a const declared without export', () => {
    const source = `
      const notAStory = 1;
      export default { title: 'X' };
      export const Real = {};
    `;
    expect(parseStoryFileMeta(source)).toEqual({
      title: 'X',
      explicitId: undefined,
      componentIdentifier: undefined,
      exportNames: ['Real'],
    });
  });
});
