/**
 * Signing in to the disposable stack — through the app's own form, on purpose.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE FORM AND NOT AN INJECTED TOKEN
 * ═══════════════════════════════════════════════════════════════════════════
 * The fast way to reach an authenticated screen is to mint a JWT and write it
 * into `localStorage` before the first navigation. It is also the way that
 * proves the least: it asserts that the app renders when handed a session
 * shaped the way the TEST believes sessions are shaped.
 *
 * A capture is a claim about the real product. Driving `/login` exercises
 * GoTrue, the password grant, `itera.custom_access_token_hook`, supabase-js's
 * own session persistence, and the app's `RequireAuth` — the whole chain that
 * decides which screen a real person sees. When the hook is misconfigured the
 * form path FAILS; the injected path succeeds and captures a role-less user
 * wearing an admin's URL.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ A REDIRECT IS NOT AN ERROR HERE, AND THAT IS THE DANGER
 * ═══════════════════════════════════════════════════════════════════════════
 * `RequireRole` does not render a 403. It silently `<Navigate>`s to `/`, which
 * answers 200 with a perfectly good home page. A capture that only checked the
 * HTTP status would record the home page six times and file it under six admin
 * routes — a confidently wrong map, which is worse than a missing one.
 *
 * `expectSettledAt()` is the guard: it requires the pathname AFTER the app has
 * settled to be the one that was asked for. Every capture goes through it.
 */
import { expect, type Page } from "@playwright/test";

/** One identity of the bring-up stack. Mirrors `bringup/env.sh`. */
export interface BringupIdentity {
  email: string;
  password: string;
  /** The role `itera.memberships` grants in the `itera` tenant. */
  role: "tenant_admin" | "instructor" | "learner";
}

/** Read one required value from the environment `bringup/env.sh` exports. */
function fromEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — run the suite as \`npm run e2e:bringup\`, which ` +
        `sources bringup/env.sh. That file is the single source for the ` +
        `identities, so nothing here restates them.`
    );
  }
  return value;
}

export function bringupIdentity(role: BringupIdentity["role"]): BringupIdentity {
  const password = fromEnv("ITERA_BRINGUP_PASSWORD");
  switch (role) {
    case "tenant_admin":
      return { email: fromEnv("ITERA_BRINGUP_ADMIN_EMAIL"), password, role };
    case "instructor":
      return { email: fromEnv("ITERA_BRINGUP_INSTRUCTOR_EMAIL"), password, role };
    case "learner":
      return { email: fromEnv("ITERA_BRINGUP_LEARNER_EMAIL"), password, role };
  }
}

/**
 * Drive `/login` and return once the app has a session.
 *
 * The wait is on the app LEAVING `/login`, not on a network response: a
 * successful password grant that the app then refuses (an unconfirmed email, a
 * missing membership) still answers 200 on the wire, and waiting for the
 * response would call that a login.
 */
export async function signIn(page: Page, identity: BringupIdentity): Promise<void> {
  await page.goto("/login");
  await expect(page.getByTestId("login-form")).toBeVisible();

  await page.getByTestId("email-input").fill(identity.email);
  await page.getByTestId("password-input").fill(identity.password);
  await page.getByTestId("submit-login").click();

  // Surface the app's own message instead of a bare timeout — a wrong password
  // and a missing GoTrue are very different problems and the page says which.
  const error = page.getByTestId("login-error");
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }),
    error.waitFor({ state: "visible", timeout: 30_000 }).then(async () => {
      throw new Error(`login refused for ${identity.email}: ${await error.textContent()}`);
    }),
  ]);
}

/**
 * Assert the app really is on `expectedPath`, after it has settled.
 *
 * This is the anti-redirect guard described in the header. It is a separate
 * exported function rather than an inline `expect` so that every capture site
 * has to go through it and none can quietly skip it.
 */
export async function expectSettledAt(page: Page, expectedPath: string): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, {
      timeout: 15_000,
      message:
        `the app did not settle on ${expectedPath}. RequireRole redirects ` +
        `instead of rendering a 403, so this usually means the signed-in ` +
        `identity lacks the role that route needs — not that the route is broken.`,
    })
    .toBe(expectedPath);
}
