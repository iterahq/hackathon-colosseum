import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequireAuth } from '@/auth/RequireAuth';
import { returnPathOf } from '@/lib/loginReturn';

const authState = { session: null as unknown, loading: false, configured: true };
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => authState }));

const APP = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const routeOf = (path: string): string => {
  const line = APP.split('\n').find((entry) => entry.includes(`<Route path="${path}" `));
  if (!line) throw new Error(`no single-line route for ${path}`);
  return line;
};

const ACCOUNT_ONLY = ['/bounties/manage', '/bounties/post', '/bounties/mine'];
const PUBLIC_ON_PURPOSE = ['/bounties', '/bounties/:slug', '/u/:wallet', '/c/:asset', '/verify', '/talent', '/try', '/world', '/gift/:wallet'];
const WALLET = 'BpdhX8hnhXCHexMJd9T51evueJZurttWfhEKELnrKeq1';

function Login() {
  const location = useLocation();
  return <div data-testid="login" data-href={`${location.pathname}${location.search}`} data-return={returnPathOf(location)} />;
}

const visit = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/bounties/post" element={<RequireAuth><div data-testid="page" /></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );

describe('account-only bounty routes', () => {
  beforeEach(() => {
    authState.session = null;
  });

  it.each(ACCOUNT_ONLY)('%s is mounted behind RequireAuth, around the lazy page', (path) => {
    expect(routeOf(path)).toMatch(/element=\{<RequireAuth><LazyRoute><\w+ \/><\/LazyRoute><\/RequireAuth>\}/);
  });

  it.each(PUBLIC_ON_PURPOSE)('%s stays public', (path) => {
    expect(routeOf(path)).not.toContain('RequireAuth');
  });

  it('a signed-out visitor goes to the login with the page and its query, and comes back to both', () => {
    visit(`/bounties/post?to=${WALLET}`);
    expect(screen.queryByTestId('page')).toBeNull();
    const login = screen.getByTestId('login');
    expect(login).toHaveAttribute('data-href', `/login?next=${encodeURIComponent(`/bounties/post?to=${WALLET}`)}`);
    expect(login).toHaveAttribute('data-return', `/bounties/post?to=${WALLET}`);
  });

  it('the link alone is enough to come back, as after a full reload inside a wallet browser', () => {
    const href = `/login?next=${encodeURIComponent(`/bounties/post?to=${WALLET}`)}`;
    visit(href);
    expect(screen.getByTestId('login')).toHaveAttribute('data-return', `/bounties/post?to=${WALLET}`);
  });

  it('a signed-in account opens the page', () => {
    authState.session = { access_token: 'header.payload.signature' };
    visit(`/bounties/post?to=${WALLET}`);
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });
});
