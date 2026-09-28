import { describe, expect, it } from 'vitest';
import { injectOrderTag, isDesignPlaygroundTitle, PLAYGROUND_INDEXER_TEST } from './storybook-playground-indexer';
import { buildOrderTag } from './storybook-playground-order';

describe('injectOrderTag', () => {
  it('appends the tag to every returned index input, keeping existing tags', () => {
    const inputs = [
      { type: 'story' as const, exportName: 'Default', tags: ['some-tag'] },
      { type: 'story' as const, exportName: 'Other' },
    ];
    const tag = buildOrderTag(42);

    const result = injectOrderTag(inputs, tag);

    expect(result[0].tags).toEqual(['some-tag', tag]);
    expect(result[1].tags).toEqual([tag]);
    // Original inputs are untouched (args/decorators/parameters/play live on
    // the CSF module itself, not on the index input — this function never
    // touches that, only adds a tag for sorting).
    expect(inputs[0].tags).toEqual(['some-tag']);
  });
});

describe('PLAYGROUND_INDEXER_TEST', () => {
  it('matches design-playground story files', () => {
    expect(PLAYGROUND_INDEXER_TEST.test('design-playground/DesignPlayground.stories.tsx')).toBe(true);
  });

  it('matches generated PR re-export story files', () => {
    expect(PLAYGROUND_INDEXER_TEST.test('.storybook/generated/pr-517-0.stories.tsx')).toBe(true);
  });

  it('matches a src/ story file, since its title decides whether it is tagged', () => {
    expect(PLAYGROUND_INDEXER_TEST.test('src/stories/InstructorStageLab.stories.tsx')).toBe(true);
  });

  it('does not match a non-story file under design-playground', () => {
    expect(PLAYGROUND_INDEXER_TEST.test('design-playground/helpers.ts')).toBe(false);
  });
});

describe('isDesignPlaygroundTitle', () => {
  it('accepts the group root and its children', () => {
    expect(isDesignPlaygroundTitle('Design Playground')).toBe(true);
    expect(isDesignPlaygroundTitle('Design Playground/Instructor Stage Lab')).toBe(true);
  });

  it('rejects other groups and look-alike prefixes', () => {
    expect(isDesignPlaygroundTitle('Organisms/Activities/8 · Cena/Xray')).toBe(false);
    expect(isDesignPlaygroundTitle('Design Playground Extra')).toBe(false);
    expect(isDesignPlaygroundTitle(undefined)).toBe(false);
  });
});
