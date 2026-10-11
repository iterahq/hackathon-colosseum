import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { TalentBoard } from '@/types/talent';
import TalentPage from './TalentPage';

const useTalentBoard = vi.fn();
vi.mock('@/hooks/useTalent', () => ({ useTalentBoard: (filters: unknown) => useTalentBoard(filters) }));
vi.mock('@/components/bounty/bountyUi', async (original) => ({ ...(await original<object>()), BountyShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const board = (over: Partial<TalentBoard> = {}): TalentBoard => ({
  source: 'recorded',
  readAt: '2026-10-11T12:00:00Z',
  totalListed: 1,
  capabilities: [{ key: 'html-tags', title: 'Reads HTML' }],
  learners: [{ wallet: 'W1111111111111111111111111111111', name: 'Ana', avatar: null, headline: null, stampedDays: 2, totalDays: 15, certifications: 1, capabilities: [], bountiesPaid: 0, bountiesPaidLamports: 0, lastStampAt: null, profileUrl: '/u/W1', teamTest: false }],
  ...over,
});
const show = (path = '/talent') => render(<I18nProvider><MemoryRouter initialEntries={[path]}><TalentPage /></MemoryRouter></I18nProvider>);

describe('TalentPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('explains the board, says the numbers are recorded and lists the cards', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board() });
    show();
    expect(screen.getByTestId('talent-intro')).toHaveTextContent('conferido na chain');
    expect(screen.getByTestId('talent-source')).toHaveTextContent('Abra o perfil para ler a chain agora');
    expect(screen.getAllByTestId('talent-card')).toHaveLength(1);
  });

  it('reads the filters from the address and passes them on', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board() });
    show('/talent?capability=html-tags&min_days=3');
    expect(useTalentBoard).toHaveBeenCalledWith({ capability: 'html-tags', minDays: 3 });
    fireEvent.click(screen.getByTestId('talent-filter-clear'));
    expect(useTalentBoard).toHaveBeenLastCalledWith({ capability: '', minDays: 0 });
  });

  it('shows the loading state', () => {
    useTalentBoard.mockReturnValue({ isPending: true, isError: false, data: undefined });
    show();
    expect(screen.getByTestId('talent-loading')).toBeInTheDocument();
  });

  it('shows an error with a retry', () => {
    const refetch = vi.fn();
    useTalentBoard.mockReturnValue({ isPending: false, isError: true, data: undefined, refetch });
    show();
    fireEvent.click(screen.getByRole('button', { name: /tentar|try/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the honest empty state with a link to the trails', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board({ learners: [], totalListed: 0 }) });
    show();
    expect(screen.getByTestId('talent-empty')).toHaveTextContent('Nenhuma pessoa listada ainda. Termine um dia e liste a si mesmo.');
    expect(screen.getByTestId('talent-empty-cta')).toHaveAttribute('href', '/');
  });

  it('shows another message when a filter leaves nobody', () => {
    useTalentBoard.mockReturnValue({ isPending: false, isError: false, data: board({ learners: [], totalListed: 3 }) });
    show('/talent?min_days=9');
    expect(screen.getByTestId('talent-empty')).toHaveTextContent('Ninguém com esse filtro.');
    expect(screen.queryByTestId('talent-empty-cta')).toBeNull();
  });
});
