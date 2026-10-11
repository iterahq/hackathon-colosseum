import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const show = (over: Partial<TalentLearner> = {}) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        <TalentCard learner={learner(over)} />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('TalentCard', () => {
  it('shows what was proven and links to the proof and to a paid mission for this wallet', () => {
    show();
    expect(screen.getByTestId('talent-card-name')).toHaveTextContent('Ana');
    expect(screen.getByTestId('talent-card-days')).toHaveTextContent('3 de 15 dias carimbados');
    expect(screen.getByTestId('talent-card-capabilities')).toHaveTextContent('Reads HTML');
    expect(screen.getByTestId('talent-card-paid')).toHaveTextContent('2 missões pagas · 0,02 SOL');
    expect(screen.getByTestId('talent-card-proof')).toHaveAttribute('href', '/u/CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW');
    expect(screen.getByTestId('talent-card-mission')).toHaveAttribute('href', '/bounties/post?to=CQziGuEV4i8yGBHwQQJMpe6tACSMR5jWUWjmYSGVDAhW');
    expect(screen.queryByTestId('talent-card-team-test')).toBeNull();
  });

  it('labels the team test account and falls back for a missing name and capabilities', () => {
    show({ teamTest: true, name: null, capabilities: [], bountiesPaid: 0, bountiesPaidLamports: 0 });
    expect(screen.getByTestId('talent-card-team-test')).toHaveTextContent('Conta de teste da equipe');
    expect(screen.getByTestId('talent-card-name')).toHaveTextContent('Aprendiz da Itera');
    expect(screen.getByTestId('talent-card-paid')).toHaveTextContent('Nenhuma missão paga ainda');
    expect(screen.queryByTestId('talent-card-capabilities')).toBeNull();
  });
});
