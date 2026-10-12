import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import BountyPostPage from './BountyPostPage';

const session = { signedIn: false, userId: 'anon' };
vi.mock('@/hooks/useBounties', () => ({
  useBountySession: () => session,
  useBountyPostOptions: () => ({ isPending: true, data: undefined }),
  useMyPostedBounties: () => ({ isPending: true, data: undefined }),
}));
vi.mock('@/components/bounty/bountyUi', async (original) => ({ ...(await original<object>()), BountyShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/bounty/PostForm', () => ({ PostForm: ({ initialInvitee }: { initialInvitee: string | null }) => <div data-testid="post-form" data-invitee={initialInvitee ?? ''} /> }));

const WALLET = 'BRNkmbKCGxqL4p9W67sgiHRev6VAdzScSqBQYmS36Upx';
const show = (path: string) => render(<I18nProvider><MemoryRouter initialEntries={[path]}><BountyPostPage /></MemoryRouter></I18nProvider>);

describe('BountyPostPage ?to=', () => {
  beforeEach(() => {
    session.signedIn = false;
  });

  it('signed out: names the invitee and keeps it through sign-in', () => {
    show(`/bounties/post?to=${WALLET}`);
    expect(screen.getByTestId('bounty-post-direct-signin')).toHaveTextContent(`BRNk…${WALLET.slice(-4)}`);
    expect(screen.getByRole('link', { name: /Entrar/ })).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/bounties/post?to=${WALLET}`)}`);
    expect(screen.queryByTestId('bounty-post-to-ignored')).toBeNull();
  });

  it('an invalid value is ignored with a visible note and never reaches the form', () => {
    show('/bounties/post?to=https://evil.example');
    expect(screen.getByTestId('bounty-post-to-ignored')).toBeInTheDocument();
    expect(screen.queryByTestId('bounty-post-direct-signin')).toBeNull();
    expect(screen.getByRole('link', { name: /Entrar/ })).toHaveAttribute('href', `/login?next=${encodeURIComponent('/bounties/post')}`);
  });

  it('no parameter: nothing direct, no note', () => {
    show('/bounties/post');
    expect(screen.queryByTestId('bounty-post-to-ignored')).toBeNull();
    expect(screen.queryByTestId('bounty-post-direct-signin')).toBeNull();
  });
});
