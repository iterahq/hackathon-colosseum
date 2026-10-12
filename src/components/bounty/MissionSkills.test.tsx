import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { AskingForPreview, MissionSkillRow, type SkillRequirement } from './MissionSkills';

const show = (requirement: SkillRequirement | null, max?: number) => render(<I18nProvider><MissionSkillRow requirement={requirement} max={max} /></I18nProvider>);

describe('MissionSkillRow', () => {
  it('shows the gate in one line and a neutral badge per skill', () => {
    show({ program: 'itera-v2', trail: 'Semana 1 · HTML', minDays: 1 });
    expect(screen.getByTestId('mission-skills-gate')).toHaveTextContent('Semana 1 · HTML · 1 dia carimbado');
    const badges = screen.getAllByTestId('skill-badge');
    expect(badges.map((badge) => badge.textContent)).toEqual(['Tags', 'Esqueleto']);
    expect(badges.every((badge) => badge.getAttribute('data-state') === 'neutral')).toBe(true);
    expect(screen.queryByTestId('mission-skills-more')).toBeNull();
  });

  it('keeps the latest skills and counts the ones left out', () => {
    show({ program: 'itera-v2', trail: 'Semana 2 · CSS', minDays: 3 });
    expect(screen.getByTestId('mission-skills')).toHaveAttribute('data-count', '6');
    expect(screen.getAllByTestId('skill-badge')).toHaveLength(2);
    expect(screen.getByTestId('mission-skills-more')).toHaveTextContent('+4');
    expect(screen.getByTestId('mission-skills-more')).toHaveTextContent('e mais 4 skills');
  });

  it('falls back to the plain requirement chip for a trail outside the graph', () => {
    show({ program: 'itera-v2', trail: 'Week 9 · Rust', minDays: 2 });
    expect(screen.queryByTestId('mission-skills')).toBeNull();
    expect(screen.getByText('Week 9 · Rust · 2 dias carimbados')).toBeInTheDocument();
  });

  it('renders nothing with no requirement', () => {
    const { container } = show(null);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AskingForPreview', () => {
  const trail = { title: { pt: 'Semana 2 · CSS', en: 'Week 2 · CSS' }, totalDays: 5 };
  const preview = (minDays: number | null, chosen: typeof trail | undefined = trail) => render(<I18nProvider><AskingForPreview trail={chosen} minDays={minDays} /></I18nProvider>);

  it('shows every skill of the days asked, neutral', () => {
    preview(2);
    expect(screen.getByTestId('asking-for')).toHaveAttribute('data-count', '4');
    expect(screen.getAllByTestId('skill-badge').map((badge) => badge.getAttribute('data-claim'))).toEqual(['css-rules', 'css-selectors', 'css-box', 'css-sizing']);
    expect(screen.getAllByTestId('skill-badge').every((badge) => badge.getAttribute('data-state') === 'neutral')).toBe(true);
  });

  it('is empty while the days are missing, zero or past the trail, and for a trail outside the graph', () => {
    for (const days of [null, 0, 6]) {
      const { container, unmount } = preview(days);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
    expect(preview(2, undefined).container).toBeEmptyDOMElement();
    expect(preview(2, { title: { pt: 'Semana 9', en: 'Week 9' }, totalDays: 5 }).container).toBeEmptyDOMElement();
  });
});
