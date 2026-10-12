import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { BountyDetail } from '@/types/bounty';
import { PostedBy } from './BountyPage';

const WALLET = '5tD2mbKCGxqL4p9W67sgiHRev6VAdzScSqBQYmS3h1s';
const bounty = (postedBy: Record<string, unknown>, over: Record<string, unknown> = {}) => ({ postedBy, writtenIn: null, ...over }) as unknown as BountyDetail;
const show = (b: BountyDetail) => render(<I18nProvider><MemoryRouter><PostedBy bounty={b} /></MemoryRouter></I18nProvider>);

describe('PostedBy', () => {
  it('a team bounty is one label and no wallet links', () => {
    show(bounty({ kind: 'team', teamTest: false, name: 'DevFellowship', wallet: null, walletShort: null }));
    expect(screen.getByTestId('bounty-posted-by')).toHaveTextContent(/DevFellowship/);
    expect(screen.queryByTestId('bounty-posted-explorer')).toBeNull();
    expect(screen.queryByTestId('bounty-posted-more-toggle')).toBeNull();
  });

  it('a wallet bounty is a tag, the name, the wallet as the profile link and one explorer link', () => {
    show(bounty({ kind: 'wallet', teamTest: false, name: 'Acme', wallet: WALLET, walletShort: '5tD2…h1s' }, { writtenIn: 'en' }));
    expect(screen.getByTestId('bounty-posted-tag')).toHaveTextContent(/Externo|Outside/);
    expect(screen.getByTestId('bounty-posted-profile')).toHaveAttribute('href', `/u/${WALLET}`);
    expect(screen.getByTestId('bounty-posted-profile')).toHaveTextContent('5tD2…h1s');
    expect(screen.getByTestId('bounty-posted-explorer')).toHaveAttribute('href', expect.stringContaining(WALLET));
    const more = screen.getByTestId('bounty-posted-more');
    expect(more).toHaveAttribute('hidden');
    expect(more).toContainElement(screen.getByTestId('bounty-written-in'));
    fireEvent.click(screen.getByTestId('bounty-posted-more-toggle'));
    expect(more).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('bounty-posted-more-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the team-test label visible on a bounty posted by a test wallet of the team', () => {
    show(bounty({ kind: 'wallet', teamTest: true, name: 'Walk test org', wallet: WALLET, walletShort: '5tD2…h1s' }));
    expect(screen.getByTestId('bounty-posted-by')).toHaveAttribute('data-team-test', 'true');
    expect(screen.getByTestId('bounty-posted-tag')).toHaveTextContent(/Teste do time|Team test/);
  });
});
