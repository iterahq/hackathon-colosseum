/**
 * The hermetic substrate for the activity CHARACTERIZATION baseline
 * (`activity-baseline.spec.ts`, sub-plano 0 of `20260731-itera-eventos-aprendizagem`).
 *
 * ## What this is, and what it deliberately is NOT
 *
 * It stands up the REAL app — the real `/author/activities/:id/test` route, the
 * real `<ActivityTestPage>`, the real `<ActivityTestHarness>`, the real
 * `<ActivityRenderer>`, the real per-kind components and the real
 * `answerMachine` — served from a build of THE CODE UNDER TEST, and replaces
 * exactly one thing: the PostgREST/GoTrue origin behind it.
 *
 * That seam is the whole design. A refactor of activity state (sub-plano 1)
 * changes the code above the seam and nothing below it, so mocking below the
 * seam costs the baseline nothing and buys it everything:
 *
 *  - **It tests the PR, not production.** The suite runs against `vite preview`
 *    of the current tree. An E2E pointed at `app.iterahq.dev` would exercise the
 *    DEPLOYED reducers no matter what the PR changed — worse than useless as a
 *    refactor gate, because it would be green while the refactor was broken.
 *  - **It needs zero secrets.** `iterahq/itera-player` has exactly two Actions
 *    secrets (`CLOUDFLARE_*`) — verified 2026-07-31. `ITERA_SMOKE_*` and
 *    `VITE_SUPABASE_*` are NOT provisioned, which is precisely why `e2e.yml`
 *    has been red/empty. A blocking PR gate that needs a credential nobody has
 *    provisioned is a blocking PR gate that is always red.
 *  - **It is content-immune.** Fixtures are frozen in `activityFixtures.ts`, so
 *    the baseline moves only when BEHAVIOUR moves. Discovering activities from
 *    the live DB would make an author's content edit look like a refactor
 *    regression — the one failure mode a characterization test must not have.
 *  - **It writes nothing, anywhere.** There is no DB connection to write to.
 *    That is a stronger V4 than "we counted rows and none appeared".
 *
 * ## The stub origin
 *
 * `VITE_SUPABASE_URL` is baked at build time as `http://stub.supabase.invalid`.
 * `.invalid` is a reserved TLD (RFC 2606) that can never resolve, so any request
 * this module forgets to stub FAILS LOUDLY instead of silently reaching a real
 * server. `isSupabaseConfigured` is therefore `true` — required, because
 * `<RequireRole>` redirects to `/` in unconfigured mode.
 *
 * The supabase-js storage key is derived as
 * `sb-${new URL(url).hostname.split('.')[0]}-auth-token` → `sb-stub-auth-token`.
 * If that derivation ever changes upstream, `seedSession` breaks loudly (the
 * route never authenticates) rather than subtly.
 */
import type { Page, Route } from '@playwright/test';
import type { ActivityFixture } from './activityFixtures';

/** Must match the `VITE_SUPABASE_URL` the e2e build is compiled with. */
export const STUB_SUPABASE_URL = 'http://stub.supabase.invalid';

/** supabase-js: `sb-<first hostname label>-auth-token`. */
const STORAGE_KEY = 'sb-stub-auth-token';

const AUTH_UID = '00000000-0000-4000-8000-000000000001';
const ITERA_USER_ID = '00000000-0000-4000-8000-000000000002';
const TENANT_ID = '00000000-0000-4000-8000-000000000003';

/** A syntactically valid, unsigned JWT. Nothing verifies it — the stub IS the server. */
function fakeJwt(): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({
      sub: AUTH_UID,
      email: 'e2e-baseline@stub.invalid',
      role: 'authenticated',
      aud: 'authenticated',
      exp,
      // NOT a guest: `RequireAuth` bounces guest tokens to the guest route.
      app_metadata: { provider: 'email' },
      user_metadata: {},
    }),
    'stub-signature-not-verified',
  ].join('.');
}

function fakeUser() {
  return {
    id: AUTH_UID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e-baseline@stub.invalid',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function fakeSession() {
  const token = fakeJwt();
  return {
    access_token: token,
    token_type: 'bearer',
    // Long enough that GoTrue's proactive refresh never fires mid-suite. A
    // refresh would hit `/auth/v1/token`, which is stubbed anyway — this just
    // keeps the network log empty and the failure modes few.
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    refresh_token: 'stub-refresh-token',
    user: fakeUser(),
  };
}

/**
 * Put a session in localStorage BEFORE any app script runs, so `getSession()`
 * resolves from storage and `<RequireAuth>` never renders its redirect.
 * `addInitScript` runs on every navigation in the context, including the SPA's
 * own reloads.
 */
export async function seedSession(page: Page): Promise<void> {
  const payload = JSON.stringify(fakeSession());
  await page.addInitScript(
    ([key, value]) => {
      // Init scripts also run inside the sandboxed code preview iframe, where reading
      // `localStorage` throws; only the app's own frames need a session.
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // opaque-origin frame
      }
    },
    [STORAGE_KEY, payload] as const
  );
}

/** PostgREST-shaped JSON reply. */
function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

/**
 * The `itera.activities` row shape `getActivityById` selects. Kept in one place
 * so a column added to that select fails here, visibly, once.
 */
function activityRow(fx: ActivityFixture) {
  return {
    id: fx.id,
    lesson_id: '00000000-0000-4000-8000-00000000dead',
    ordinal: 0,
    kind: fx.kind,
    spec: fx.spec,
    rubric: fx.rubric ?? {},
    status: fx.status ?? 'published',
    artifact_policy: fx.artifactPolicy ?? {},
  };
}

/**
 * Install the stub origin on a page.
 *
 * Every request to the stub host is answered here. The `activities` handler
 * resolves the id out of the PostgREST filter (`id=eq.<uuid>`) and serves the
 * matching fixture, so ONE handler covers the whole catalogue and the test body
 * only ever navigates.
 *
 * ⚠️ The catch-all at the bottom answers `[]` rather than aborting. Aborting
 * would turn every incidental query the shell makes (branding, profile) into a
 * console error and, worse, into flake. `[]` is what an empty RLS-scoped read
 * looks like to this app, which is the honest stand-in.
 */
export async function installSupabaseStub(
  page: Page,
  fixtures: readonly ActivityFixture[]
): Promise<void> {
  const byId = new Map(fixtures.map((f) => [f.id, f]));

  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    // ── GoTrue ────────────────────────────────────────────────────────────────
    if (path.startsWith('/auth/v1/user')) return json(route, fakeUser());
    if (path.startsWith('/auth/v1/token')) return json(route, fakeSession());
    if (path.startsWith('/auth/v1/logout')) return json(route, {}, 204);
    if (path.startsWith('/auth/v1/')) return json(route, {});

    // ── PostgREST ─────────────────────────────────────────────────────────────
    // `getIteraUserId()` — SECURITY DEFINER RPC, returns a bare JSON string.
    if (path.endsWith('/rpc/current_itera_user_id')) return json(route, ITERA_USER_ID);

    // `<RequireRole role="author">` reads this. `author` is the narrowest role
    // that opens the route, so the fixture persona is exactly an author and
    // nothing more — the baseline must not accidentally depend on admin reach.
    if (path.endsWith('/memberships')) {
      return json(route, [
        {
          tenant_id: TENANT_ID,
          role: 'author',
          tenants: { slug: 'e2e-baseline', name: 'E2E Baseline', live_class_enabled: false },
        },
      ]);
    }

    if (path.endsWith('/users')) return json(route, [{ id: ITERA_USER_ID }]);

    if (path.endsWith('/activities')) {
      // PostgREST filter syntax: `?id=eq.<uuid>&select=…`
      const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
      const fx = byId.get(id);
      // `.maybeSingle()` sends `Accept: application/vnd.pgrst.object+json`, so
      // the body is the OBJECT, not an array. An unknown id gets PostgREST's
      // empty-200, which is exactly what makes `ActivityNotFoundError` fire —
      // preserving the route's own not-found path rather than papering over it.
      if (!fx) return route.fulfill({ status: 200, contentType: 'application/json', body: '' });
      return json(route, activityRow(fx));
    }

    return json(route, []);
  });
}

/**
 * The full substrate for one page: session + stub origin.
 * Call before the first `goto`.
 */
export async function installHarnessSubstrate(
  page: Page,
  fixtures: readonly ActivityFixture[]
): Promise<void> {
  await seedSession(page);
  await installSupabaseStub(page, fixtures);
}

/** The author test-harness URL for a fixture — the same URL a human opens. */
export function harnessUrl(fx: ActivityFixture): string {
  return `/author/activities/${fx.id}/test`;
}
