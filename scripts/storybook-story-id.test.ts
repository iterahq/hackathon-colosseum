import { describe, expect, it } from 'vitest';
import { sanitizeStoryIdPart, toStoryId, toStoryIdForMeta } from './storybook-story-id';

describe('sanitizeStoryIdPart', () => {
  it('lowercases and collapses punctuation runs into a single hyphen', () => {
    expect(sanitizeStoryIdPart('Activities/BYOC/byoc_pick_best')).toBe(
      'activities-byoc-byoc-pick-best',
    );
  });

  it('trims leading and trailing hyphens produced by the collapse', () => {
    expect(sanitizeStoryIdPart('  Hello, World!  ')).toBe('hello-world');
  });

  it('collapses slashes and spaces but leaves the PT-BR interpunct as-is (matches @storybook/csf)', () => {
    expect(sanitizeStoryIdPart('Organisms/Activities/8 · Cena/Xray')).toBe(
      'organisms-activities-8-·-cena-xray',
    );
  });
});

describe('toStoryId', () => {
  it('joins the sanitized kind and name with a double hyphen', () => {
    expect(toStoryId('Activities/BYOC/byoc_pick_best', 'Default')).toBe(
      'activities-byoc-byoc-pick-best--default',
    );
  });

  it('returns only the sanitized kind when no export name is given', () => {
    expect(toStoryId('Activities/BYOC/byoc_pick_best')).toBe('activities-byoc-byoc-pick-best');
  });
});

describe('toStoryIdForMeta', () => {
  it('uses the explicit id verbatim instead of sanitizing the title', () => {
    expect(
      toStoryIdForMeta(
        { title: 'Organisms/Activities/0 · Dispatcher (todos os contratos)', explicitId: 'activities-dispatcher' },
        'Playing',
      ),
    ).toBe('activities-dispatcher--playing');
  });

  it('falls back to sanitizing the title when there is no explicit id', () => {
    expect(toStoryIdForMeta({ title: 'Activities/BYOC/byoc_pick_best' }, 'Default')).toBe(
      'activities-byoc-byoc-pick-best--default',
    );
  });
});
