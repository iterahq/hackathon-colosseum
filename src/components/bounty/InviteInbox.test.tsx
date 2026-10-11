import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { Bounty } from '@/types/bounty';
import { InviteInbox } from './InviteInbox';

const useInvitedInbox = vi.fn();
vi.mock('@/hooks/useInvites', () => ({ useInvitedInbox: () => useInvitedInbox() }));

const NOW = Date.parse('2026-10-11T00:00:00Z');
const row = (over: Partial<Bounty> = {}) =>
  ({ id: 'b1', slug: 'bakery-table', title: 'Accessible table', rewardSol: '0.01', direct: true, status: 'open', expiresAt: '2026-10-13T06:00:00Z', postedBy: { name: 'Bakery Co' }, ...over }) as Bounty;
const show = () => render(<I18nProvider><MemoryRouter><InviteInbox now={NOW} /></MemoryRouter></I18nProvider>);

describe('InviteInbox', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows title, reward, sponsor, time left and a link to the bounty', () => {
    useInvitedInbox.mockReturnValue({ data: { chainRead: true, bounties: [row()] } });
    show();
    const item = screen.getByTestId('invite-row');
    expect(item).toHaveAttribute('href', '/bounties/bakery-table');
    expect(item).toHaveTextContent('Accessible table');
    expect(item).toHaveTextContent('de Bakery Co');
    expect(item).toHaveTextContent('faltam 2d 6h');
    expect(item).toHaveTextContent('0,01');
    expect(screen.getByTestId('invite-inbox')).toHaveTextContent('Enviadas para você');
    expect(screen.queryByTestId('invite-inbox-unchecked')).toBeNull();
  });

  it('is hidden with nothing open: empty, only settled rows, loading and failed', () => {
    useInvitedInbox.mockReturnValue({ data: { chainRead: true, bounties: [] } });
    const { container, rerender } = show();
    expect(container).toBeEmptyDOMElement();
    useInvitedInbox.mockReturnValue({ data: { chainRead: true, bounties: [row({ status: 'paid' }), row({ id: 'b2', status: 'refunded' })] } });
    rerender(<I18nProvider><MemoryRouter><InviteInbox now={NOW} /></MemoryRouter></I18nProvider>);
    expect(container).toBeEmptyDOMElement();
    useInvitedInbox.mockReturnValue({ data: undefined, isPending: true });
    rerender(<I18nProvider><MemoryRouter><InviteInbox now={NOW} /></MemoryRouter></I18nProvider>);
    expect(container).toBeEmptyDOMElement();
  });

  it('says when the chain was not read and when a bounty has no date', () => {
    useInvitedInbox.mockReturnValue({ data: { chainRead: false, bounties: [row({ expiresAt: null })] } });
    show();
    expect(screen.getByTestId('invite-inbox-unchecked')).toBeInTheDocument();
    expect(screen.getByTestId('invite-row')).toHaveTextContent('sem prazo');
  });
});
