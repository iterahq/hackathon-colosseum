import { describe, it, expect } from 'vitest';
import { lessonExitPath } from './lessonExitPath';

describe('lessonExitPath', () => {
  it('volta para o programa da lição', () => {
    expect(lessonExitPath('react-componente-reage')).toBe('/program/react-componente-reage');
  });

  it('cai na home quando a lição não tem programa resolvido', () => {
    expect(lessonExitPath(null)).toBe('/');
    expect(lessonExitPath(undefined)).toBe('/');
    expect(lessonExitPath('   ')).toBe('/');
  });

  it('escapa o slug para não montar rota fora de /program', () => {
    expect(lessonExitPath('../admin')).toBe('/program/..%2Fadmin');
  });
});
