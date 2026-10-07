import { describe, expect, it } from 'vitest';
import { choiceGridClass } from './choiceGrid.js';

const opts = (...labels: string[]) => labels.map((label) => ({ label }));

describe('choiceGridClass', () => {
  it('puts letter-sized options in one row', () => {
    expect(choiceGridClass(opts('A', 'B', 'C'))).toBe('grid-cols-3');
    expect(choiceGridClass(opts('Sim', 'Não', 'Div'))).toBe('grid-cols-3');
    expect(choiceGridClass(opts('<h1>', '<p>'))).toBe('grid-cols-2');
    expect(choiceGridClass(opts('1', '2', '3', '4'))).toBe('grid-cols-4');
  });

  it('pairs short options and keeps five letters in two columns', () => {
    expect(choiceGridClass(opts('display: flex', 'display: grid', 'float: left'))).toBe('grid-cols-2');
    expect(choiceGridClass(opts('A', 'B', 'C', 'D', 'E'))).toBe('grid-cols-2');
  });

  it('on a phone, drops to fewer columns when a label would be broken one letter per line', () => {
    expect(choiceGridClass(opts('Azul', 'Verde', 'Tomate'))).toBe('grid-cols-2 sm:grid-cols-3');
    expect(choiceGridClass(opts('12', '24', '36', '48'))).toBe('grid-cols-2 sm:grid-cols-4');
  });

  it('on a phone, gives a word too long for half the column a row of its own', () => {
    expect(choiceGridClass(opts('tracejada', 'solid'))).toBe('grid-cols-2');
    expect(choiceGridClass(opts('background', 'color'))).toBe('grid-cols-1 sm:grid-cols-2');
    expect(choiceGridClass(opts('text-align', 'float'))).toBe('grid-cols-1 sm:grid-cols-2');
  });

  it('counts what is drawn: marks are gone, a code chip carries its padding and does not break', () => {
    expect(choiceGridClass(opts('**A**', '**B**', '**C**'))).toBe('grid-cols-3');
    expect(choiceGridClass(opts('`<h1>`', '`<p>`'))).toBe('grid-cols-2');
    expect(choiceGridClass(opts('`h1`', '`p`', '`li`'))).toBe('grid-cols-2 sm:grid-cols-3');
    expect(choiceGridClass(opts('`<section>`', '`<div>`'))).toBe('grid-cols-1 sm:grid-cols-2');
    expect(choiceGridClass(opts('`float: left`', '`flex`'))).toBe('grid-cols-1 sm:grid-cols-2');
  });

  it('counts a mark the renderer prints: unpaired asterisks and equals signs stay in the label', () => {
    expect(choiceGridClass(opts('a==b', 'a===b', 'a=b'))).toBe('grid-cols-2 sm:grid-cols-3');
    expect(choiceGridClass(opts('2**3', '2**10', '2*3'))).toBe('grid-cols-2 sm:grid-cols-3');
    expect(choiceGridClass(opts('=', '==', '===', '!'))).toBe('grid-cols-2 sm:grid-cols-4');
  });

  it('keeps one option per row for sentences, media or a lone option', () => {
    expect(choiceGridClass(opts('A', 'The browser reads it top to bottom'))).toBe('');
    expect(choiceGridClass([{ label: 'A', image_url: 'x.png' }, { label: 'B' }])).toBe('');
    expect(choiceGridClass([{ image_url: 'x.png' }, { image_url: 'y.png' }])).toBe('');
    expect(choiceGridClass(opts('A'))).toBe('');
  });
});
