import { describe, it, expect } from 'vitest';
import { splitTitle } from './splitTitle';

describe('splitTitle', () => {
  it('splits "Headline: subline" into two layers', () => {
    expect(splitTitle('Domínio → Agente: de analista a arquiteto agêntico')).toEqual({
      headline: 'Domínio → Agente',
      subline: 'de analista a arquiteto agêntico',
    });
  });

  it('splits "Headline — subline" (em dash)', () => {
    expect(splitTitle('IA em Cooperativas Agro — portal-produtor e dados unificados')).toEqual({
      headline: 'IA em Cooperativas Agro',
      subline: 'portal-produtor e dados unificados',
    });
  });

  it('returns the whole title as headline when there is no subline', () => {
    expect(splitTitle('Modele seus dados com IA')).toEqual({
      headline: 'Modele seus dados com IA',
      subline: null,
    });
  });

  it('does not split a time-like "10:30" (no space after the colon)', () => {
    expect(splitTitle('Aula 10:30')).toEqual({
      headline: 'Aula 10:30',
      subline: null,
    });
  });
});
