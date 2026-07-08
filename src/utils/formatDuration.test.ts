import { describe, it, expect } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('spells out seconds under a minute', () => {
    expect(formatDuration(7)).toBe('7 segundos');
    expect(formatDuration(1)).toBe('1 segundo');
    expect(formatDuration(0)).toBe('0 segundos');
  });

  it('combines minutes and seconds', () => {
    expect(formatDuration(75)).toBe('1 minuto e 15 segundos');
    expect(formatDuration(135)).toBe('2 minutos e 15 segundos');
  });

  it('omits seconds on a whole minute', () => {
    expect(formatDuration(60)).toBe('1 minuto');
    expect(formatDuration(120)).toBe('2 minutos');
  });

  it('rounds and floors at zero', () => {
    expect(formatDuration(7.4)).toBe('7 segundos');
    expect(formatDuration(-5)).toBe('0 segundos');
  });
});
