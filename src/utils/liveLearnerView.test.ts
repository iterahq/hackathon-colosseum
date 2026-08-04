import { describe, it, expect } from 'vitest';
import { liveLearnerHref, wantsLearnerView } from './liveLearnerView';

describe('liveLearnerView', () => {
  it('o link que o professor clica é o que a página honra', () => {
    const url = new URL(liveLearnerHref('sess-1'), 'https://app.iterahq.dev');
    expect(url.pathname).toBe('/live/sess-1');
    expect(wantsLearnerView(url.searchParams)).toBe(true);
  });

  it('entrar sem o parâmetro segue sendo o caminho de instrutor', () => {
    expect(wantsLearnerView(new URLSearchParams(''))).toBe(false);
    expect(wantsLearnerView(new URLSearchParams('como=professor'))).toBe(false);
  });
});
