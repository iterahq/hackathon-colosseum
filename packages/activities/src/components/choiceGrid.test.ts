import { describe, expect, it } from 'vitest';
import { choiceGridClass } from './choiceGrid.js';

const opts = (...labels: string[]) => labels.map((label) => ({ label }));

describe('choiceGridClass', () => {
  it('puts letter-sized options in one row', () => {
    expect(choiceGridClass(opts('A', 'B', 'C'))).toBe('grid-cols-3');
    expect(choiceGridClass(opts('<h1>', '<p>'))).toBe('grid-cols-2');
    expect(choiceGridClass(opts('1', '2', '3', '4'))).toBe('grid-cols-4');
  });

  it('pairs short options and keeps five letters in two columns', () => {
    expect(choiceGridClass(opts('display: flex', 'display: grid', 'float: left'))).toBe('grid-cols-2');
    expect(choiceGridClass(opts('A', 'B', 'C', 'D', 'E'))).toBe('grid-cols-2');
  });

  it('keeps one option per row for sentences, media or a lone option', () => {
    expect(choiceGridClass(opts('A', 'The browser reads it top to bottom'))).toBe('');
    expect(choiceGridClass([{ label: 'A', image_url: 'x.png' }, { label: 'B' }])).toBe('');
    expect(choiceGridClass([{ image_url: 'x.png' }, { image_url: 'y.png' }])).toBe('');
    expect(choiceGridClass(opts('A'))).toBe('');
  });
});
