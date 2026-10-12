import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { TalentLearner } from '@/types/talent';
import { TalentCard } from './TalentCard';

const learner = (over: Partial<TalentLearner> = {}): TalentLearner => ({
  wallet: 'CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW',
  name: 'Ana',
  avatar: null,
  headline: 'Builds pages',
  stampedDays: 3,
  totalDays: 15,
  certifications: 1,
  capabilities: [{ key: 'html-tags', title: 'Reads HTML' }],
  bountiesPaid: 2,
  bountiesPaidLamports: 20_000_000,
  lastStampAt: '2026-10-11T10:00:00Z',
  profileUrl: '/u/CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW',
  teamTest: false,
  ...over,
});

const show = (over: Partial<TalentLearner> = {}, props: { activeSkill?: string; onPickSkill?: (key: string) => void } = {}) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <TalentCard learner={learner(over)} {...props} />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('TalentCard', () => {
  it('shows what was proven and links to the proof and to a paid mission for this wallet', () => {
    show();
    expect(screen.getByTestId('talent-card-name')).toHaveTextContent('Ana');
    expect(screen.getByTestId('talent-card-days')).toHaveTextContent('3 de 15 dias carimbados');
    expect(screen.getByTestId('talent-card-capabilities')).toHaveTextContent('Tags');
    expect(screen.getByTestId('skill-badge')).toHaveAttribute('title', 'Reads HTML');
    expect(screen.getByTestId('talent-card-paid')).toHaveTextContent('2 missões pagas · 0,02 SOL');
    expect(screen.getByTestId('talent-card-proof')).toHaveAttribute('href', '/u/CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW');
    expect(screen.getByTestId('talent-card-mission')).toHaveAttribute('href', '/bounties/post?to=CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW');
    expect(screen.queryByTestId('talent-card-team-test')).toBeNull();
  });

  it('labels the team test account and falls back for a missing name and capabilities', () => {
    show({ teamTest: true, name: null, capabilities: [], bountiesPaid: 0, bountiesPaidLamports: 0 });
    expect(screen.getByTestId('talent-card-team-test')).toHaveTextContent('Conta de teste da equipe');
    expect(screen.getByTestId('talent-card-name')).toHaveTextContent('CQzi…AhW');
    expect(screen.queryByTestId('talent-card-paid')).toBeNull();
    expect(screen.queryByTestId('talent-card-capabilities')).toBeNull();
  });

  it('draws nothing about a contact for a visitor or a learner, whatever the listing holds', () => {
    show({ hasContact: true });
    expect(screen.queryByTestId('contact-reveal')).toBeNull();
    expect(screen.queryByTestId('contact-show')).toBeNull();
    expect(screen.getByTestId('talent-card')).not.toHaveTextContent(/contato/i);
  });

  it('shows the skills as badges, the furthest first, with the rest behind a +N', () => {
    const keys = ['html-tags', 'html-skeleton', 'html-nesting', 'html-attrs', 'css-rules', 'css-selectors'];
    show({ capabilities: keys.map((key) => ({ key, title: `Sentence of ${key}` })) });
    const badges = screen.getAllByTestId('talent-card-skill');
    expect(badges.map((badge) => badge.getAttribute('data-skill'))).toEqual(['css-selectors', 'css-rules', 'html-attrs', 'html-nesting']);
    expect(badges[0]).toHaveTextContent('Seletores');
    expect(screen.getByTestId('talent-card-more')).toHaveTextContent('+2');
    expect(screen.getByTestId('talent-card-more')).toHaveTextContent('mais 2 habilidades');
  });

  it('puts the evidence medal on a badge only when the board stated the share, and counts the tiers', () => {
    show({ capabilities: [{ key: 'html-tags', title: 'A', graded: '10/12' }, { key: 'html-skeleton', title: 'B', graded: null }] });
    const [skeleton, tags] = screen.getAllByTestId('talent-card-skill');
    expect(within(tags).getByTestId('skill-badge')).toHaveAttribute('data-tier', 'middle');
    expect(within(skeleton).getByTestId('skill-badge')).not.toHaveAttribute('data-tier');
    const chips = within(screen.getByTestId('talent-card-tiers')).getAllByRole('listitem').map((chip) => [chip.getAttribute('data-tier'), chip.getAttribute('data-count')]);
    expect(chips).toEqual([['middle', '1']]);
  });

  it('a card whose evidence predates server grading wears no medal and no tier chip', () => {
    show({ capabilities: [{ key: 'html-tags', title: 'A', graded: null }, { key: 'html-skeleton', title: 'B', graded: null }] });
    expect(screen.queryByTestId('skill-badge-tier')).toBeNull();
    expect(screen.queryByTestId('talent-card-tiers')).toBeNull();
    expect(screen.getAllByTestId('skill-badge').every((badge) => badge.getAttribute('data-state') === 'lit')).toBe(true);
  });

  it('draws no medal and no tier count for a board that carries no share', () => {
    show();
    expect(screen.queryByTestId('skill-badge-tier')).toBeNull();
    expect(screen.queryByTestId('talent-card-tiers')).toBeNull();
  });

  it('a tap on a skill asks the board for that skill', () => {
    const onPickSkill = vi.fn();
    show({}, { onPickSkill });
    fireEvent.click(screen.getByTestId('talent-card-skill'));
    expect(onPickSkill).toHaveBeenCalledWith('html-tags');
    expect(screen.getByTestId('talent-card-skill')).toHaveAccessibleName('Filtrar por Reads HTML');
  });

  it('keeps every number as a chip that still says what it counts', () => {
    show();
    expect(screen.getByTestId('talent-card-certs')).toHaveTextContent('1 cert');
    expect(screen.getByTestId('talent-card-certs')).toHaveTextContent('1 certificação');
    expect(screen.getByTestId('talent-card-paid')).toHaveTextContent('2 pagas');
    expect(screen.getByTestId('talent-card-last')).toHaveTextContent('11/10');
    expect(screen.getByTestId('talent-card-last')).toHaveTextContent('Último carimbo: 11/10');
  });

  it('renders no chip for a count of zero', () => {
    show({ certifications: 0, bountiesPaid: 0, bountiesPaidLamports: 0, lastStampAt: null });
    expect(screen.getByTestId('talent-card-stats')).toBeEmptyDOMElement();
  });
});
