import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { TalentStatus } from '@/types/talent';
import { TalentOptIn } from './TalentOptIn';

const status = vi.fn();
const list = { mutate: vi.fn(), isPending: false };
const unlist = { mutate: vi.fn(), isPending: false };
vi.mock('@/hooks/useTalent', () => ({ useTalentStatus: () => status(), useTalentListing: () => ({ list, unlist }) }));

const state = (over: Partial<TalentStatus> = {}): TalentStatus => ({ wallet: 'W', listed: false, headline: null, mayList: true, reason: null, stampedDays: 2, totalDays: 15, ...over });
const show = () => render(<I18nProvider><MemoryRouter><TalentOptIn /></MemoryRouter></I18nProvider>);

describe('TalentOptIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when signed out', () => {
    status.mockReturnValue({ isPending: true, fetchStatus: 'idle', data: undefined });
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to list, counts the headline and sends it', () => {
    status.mockReturnValue({ isPending: false, fetchStatus: 'idle', data: state() });
    show();
    expect(screen.getByTestId('talent-optin-state')).toHaveTextContent('Você não está listado.');
    fireEvent.change(screen.getByTestId('talent-optin-headline'), { target: { value: 'Oi' } });
    expect(screen.getByTestId('talent-optin-counter')).toHaveTextContent('2/120');
    fireEvent.click(screen.getByTestId('talent-optin-save'));
    expect(list.mutate).toHaveBeenCalledWith('Oi', expect.any(Object));
    expect(screen.queryByTestId('talent-optin-remove')).toBeNull();
  });

  it('shows update and remove when listed', () => {
    status.mockReturnValue({ isPending: false, fetchStatus: 'idle', data: state({ listed: true, headline: 'Hi there' }) });
    show();
    expect(screen.getByTestId('talent-optin-state')).toHaveTextContent('Você está listado.');
    expect(screen.getByTestId('talent-optin-headline')).toHaveValue('Hi there');
    expect(screen.getByTestId('talent-optin-save')).toHaveTextContent('Atualizar');
    fireEvent.click(screen.getByTestId('talent-optin-remove'));
    expect(unlist.mutate).toHaveBeenCalled();
  });

  it('says why a learner cannot list and hides the form', () => {
    status.mockReturnValue({ isPending: false, fetchStatus: 'idle', data: state({ mayList: false, reason: 'nothing_proven' }) });
    show();
    expect(screen.getByTestId('talent-optin-reason')).toHaveTextContent('Termine um dia');
    expect(screen.queryByTestId('talent-optin-save')).toBeNull();
    expect(screen.queryByTestId('talent-optin-headline')).toBeNull();
  });

  it('says a wallet is needed', () => {
    status.mockReturnValue({ isPending: false, fetchStatus: 'idle', data: state({ mayList: false, reason: 'no_wallet', wallet: null }) });
    show();
    expect(screen.getByTestId('talent-optin-reason')).toHaveTextContent('Ligue uma carteira');
  });
});
