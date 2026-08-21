import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider, resources } from '@/i18n';
import { LiveOwnWorkDivider } from '@/components/live/LiveOwnWorkDivider';

describe('LiveOwnWorkDivider', () => {
  it('names the boundary in words, not only with a rule', () => {
    render(
      <I18nProvider>
        <LiveOwnWorkDivider />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-own-work-divider')).toBeTruthy();
    // The label is the whole point (P3): a bare hairline between two identical
    // activity cards reads as spacing, not as "the one below is yours".
    expect(screen.getByText(resources.pt['live.stage.ownWork'])).toBeTruthy();
  });

  it('stays pinned while the learner scrolls into their own activity', () => {
    render(
      <I18nProvider>
        <LiveOwnWorkDivider />
      </I18nProvider>
    );
    // Sem `sticky` a legenda só orienta na primeira dobra, que é exatamente
    // onde ela já era dispensável.
    const divider = screen.getByTestId('live-own-work-divider');
    expect(divider.className).toContain('sticky');
    // O espaçamento é do próprio elemento: num wrapper do tamanho dele o sticky
    // não teria por onde viajar.
    expect(divider.className).toContain('mb-6');
  });

  it('has the label in both locales', () => {
    for (const locale of ['pt', 'en'] as const) {
      expect(resources[locale]['live.stage.ownWork']).toBeTruthy();
    }
  });
});
