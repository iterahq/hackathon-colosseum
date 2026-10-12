import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { MissionSkillRow, type SkillRequirement } from './MissionSkills';

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
    expect(screen.getAllByTestId('skill-badge')).toHaveLength(3);
    expect(screen.getByTestId('mission-skills-more')).toHaveTextContent('+3');
    expect(screen.getByTestId('mission-skills-more')).toHaveTextContent('e mais 3 skills');
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
