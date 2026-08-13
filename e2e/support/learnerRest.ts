/**
 * Read the database AS THE LEARNER THE BROWSER IS SIGNED IN AS — no second
 * secret, no `service_role`, no `psql`.
 *
 * ## Why a spec ever needs this
 *
 * Some assertions are about a PREMISE rather than about pixels. `Both learners
 * are in the same tenant` is the premise that gives
 * `artifact-persistence.spec.ts` its meaning: aluno2 seeing nothing proves the
 * tenant-admin read policy (ADR-9) does not leak to ordinary peers ONLY IF
 * aluno2 is a peer. Put the two in different tenants and aluno2 sees nothing
 * for a completely unrelated reason, the assertion still passes, and it now
 * proves nothing. The UI cannot show that premise, so it has to be read.
 *
 * ## Why it is read this way and not another way
 *
 * `service_role` bypasses RLS (`rolbypassrls = TRUE`), so a read through it
 * answers a different question — "does the row exist" instead of "can this user
 * see it" — and it would put an RLS-bypassing key into the e2e harness for the
 * sake of a precondition. Neither is acceptable.
 *
 * Instead: the bearer token is the one the APP already holds in `localStorage`,
 * and the `apikey` is lifted from the app's own first REST call. So the read
 * travels the app's literal channel, carries the caller's own claims, and adds
 * no credential to this repository. On `itera.memberships`, `authenticated`
 * holds SELECT and the `memberships_select_self` policy returns
 * `user_id = itera.current_itera_user_id()` — the caller's own rows, which is
 * exactly the scope a premise check should have.
 *
 * ## Provenance
 *
 * The mechanism is not new here. `e2e/attempt-write-path.spec.ts` proved it
 * against production, and this module generalises that code so a second spec
 * does not copy it. That spec was left untouched on purpose: it writes to
 * production and cannot be re-run from a PR, so refactoring it on the strength
 * of a typecheck would be trading a verified path for an unverified one.
 */
import type { Page } from '@playwright/test';

/** The learner's own Supabase credentials, lifted from the running app. */
export interface LearnerRest {
  /** `https://<project-ref>.supabase.co/rest/v1` */
  base: string;
  apikey: string;
  token: string;
}

/**
 * Start watching for the anon key on the app's own REST traffic.
 *
 * Call this BEFORE the login that triggers the first request; the returned
 * accessor reads whatever has been captured so far.
 */
export function watchForApiKey(page: Page): () => string {
  let apikey = '';
  page.on('request', (r) => {
    if (apikey) return;
    if (!r.url().includes('/rest/v1/')) return;
    apikey = r.headers()['apikey'] ?? '';
  });
  return () => apikey;
}

/**
 * The session the APP is using, not one this helper minted. Reading the token
 * out of the app's own storage is what makes the read attributable: it is the
 * identity that just signed in, carrying whatever claims
 * `itera.custom_access_token_hook` gave it.
 */
export async function learnerRest(page: Page, apikey: string): Promise<LearnerRest> {
  const found = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const token = (JSON.parse(raw) as { access_token?: string }).access_token ?? '';
    // `sb-<project-ref>-auth-token` — the ref IS the REST host, so no second
    // secret is needed to know where to read from.
    const ref = key.replace(/^sb-/, '').replace(/-auth-token$/, '');
    return { token, ref };
  });
  if (!found) throw new Error('the app holds no Supabase session after login');
  if (!found.token) throw new Error('the app session carries no access token');
  if (!apikey) throw new Error('the app made no REST call to lift an apikey from');
  return { base: `https://${found.ref}.supabase.co/rest/v1`, apikey, token: found.token };
}

/**
 * Every tenant the SIGNED-IN user is a member of, read with that user's own
 * JWT. `memberships_select_self` scopes the rows to the caller, so this is the
 * user's own answer about itself — never a privileged view of somebody else.
 */
export async function ownTenantIds(page: Page, rest: LearnerRest): Promise<string[]> {
  const res = await page.request.get(`${rest.base}/memberships?select=tenant_id`, {
    headers: {
      apikey: rest.apikey,
      Authorization: `Bearer ${rest.token}`,
      'Accept-Profile': 'itera',
    },
  });
  if (res.status() !== 200) {
    throw new Error(`PostgREST refused the learner's own membership read: ${await res.text()}`);
  }
  const rows = (await res.json()) as { tenant_id: string }[];
  return rows.map((r) => r.tenant_id).filter(Boolean);
}
