import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { AttemptTrack } from '@/components/graph/AttemptTrack';

const journeyQuery = vi.fn();
vi.mock('@/hooks/useLearnerProfile', () => ({ useClaimJourney: () => journeyQuery() }));

const show = () => render(<I18nProvider><AttemptTrack wallet="W" claimId="html-tags" /></I18nProvider>);

describe('AttemptTrack', () => {
  beforeEach(() => vi.clearAllMocks());

  it('draws one row of dots per activity, misses before the hit, with the two numbers', () => {
    journeyQuery.mockReturnValue({
      isPending: false, isError: false,
      data: { activities: [{ mode: 'server', verdicts: [false, false, true], tries: 3 }, { mode: 'self_reported', verdicts: [true], tries: 1 }], tries: 4, firstTry: 1 },
    });
    show();
    const rows = screen.getAllByTestId('graph-track-row');
    expect(rows).toHaveLength(2);
    expect([...rows[0].querySelectorAll('[data-hit]')].map((dot) => dot.getAttribute('data-hit'))).toEqual(['false', 'false', 'true']);
    expect(rows[0]).toHaveAccessibleName('Atividade 1: 3 tentativas, servidor corrigiu');
    expect(rows[1]).toHaveAttribute('data-mode', 'self_reported');
    expect(screen.getByTestId('graph-track-tries')).toHaveTextContent('4');
    expect(screen.getByTestId('graph-track-first')).toHaveTextContent('1/2');
  });

  it('says the track comes from our table, not the chain', () => {
    journeyQuery.mockReturnValue({ isPending: false, isError: false, data: { activities: [], tries: 0, firstTry: 0 } });
    show();
    expect(screen.getByTestId('graph-track-source')).toHaveTextContent('tabela da Itera · fora da chain');
  });

  it('counts the tries it does not draw', () => {
    journeyQuery.mockReturnValue({ isPending: false, isError: false, data: { activities: [{ mode: 'server', verdicts: [false, true], tries: 21 }], tries: 21, firstTry: 0 } });
    show();
    expect(screen.getByTestId('graph-track-row')).toHaveTextContent('+19');
  });

  it('has an empty state for a stamp with no graded rows', () => {
    journeyQuery.mockReturnValue({ isPending: false, isError: false, data: { activities: [], tries: 0, firstTry: 0 } });
    show();
    expect(screen.getByTestId('graph-track-empty')).toHaveTextContent('Sem tentativas registradas');
    expect(screen.queryByTestId('graph-track-tries')).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading and a retry when the read failed', () => {
    journeyQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    const { unmount } = show();
    expect(screen.getByTestId('graph-track-loading')).toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    journeyQuery.mockReturnValue({ isPending: false, isError: true, data: undefined, refetch });
    show();
    fireEvent.click(screen.getByRole('button'));
    expect(refetch).toHaveBeenCalled();
  });
});
