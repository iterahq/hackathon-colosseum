import { describe, it, expect } from 'vitest';
import { lastWord } from './lastWord';

describe('lastWord', () => {
  it('splits off the final word', () => {
    expect(lastWord('Catálogo de cursos')).toEqual({ rest: 'Catálogo de ', last: 'cursos' });
  });

  it('returns the whole string as last when there is no space', () => {
    expect(lastWord('Catalog')).toEqual({ rest: '', last: 'Catalog' });
  });
});
