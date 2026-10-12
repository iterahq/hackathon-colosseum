import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LandingSkills } from './LandingSkills';

const show = (kind: 'proven' | 'gate') => render(<I18nProvider><LandingSkills kind={kind} /></I18nProvider>);

describe('LandingSkills', () => {
  it('shows four lit skills of the graph, one of each family and a second of HTML', () => {
    show('proven');
    const badges = within(screen.getByTestId('landing-skill-row')).getAllByTestId('skill-badge');
    expect(badges.map((badge) => badge.getAttribute('data-claim'))).toEqual(['html-tags', 'html-form', 'css-flex-row', 'js-events']);
    expect(badges.every((badge) => badge.getAttribute('data-state') === 'lit')).toBe(true);
  });

  it('shows one skill locked and then stamped', () => {
    show('gate');
    const badges = within(screen.getByTestId('landing-skill-gate')).getAllByTestId('skill-badge');
    expect(badges.map((badge) => [badge.getAttribute('data-claim'), badge.getAttribute('data-state')])).toEqual([['html-form', 'locked'], ['html-form', 'lit']]);
  });
});
