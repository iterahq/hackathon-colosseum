// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { APP_FILE, DICTIONARY_FILE, scan, violations, wordedKeys, type Gate, type Sources } from "./shell-commerce";

/**
 * Plan 20261003-itera-player-mobile, row W-7 (Q-3, Q-11 = A): inside the native shell the app never
 * names a subscription, a price or a sign-up. This is the CLOSED list of every product file that
 * links or redirects to `/subscribe` or `/signup`, talks to Stripe or the billing portal, or shows
 * a string with that wording — each with the gate that keeps it out of the shell. A new file, or a
 * new hit outside the gate of a listed file, fails here: route it through `<WebOnly>`,
 * `useShellSurface()` or `<WebOnlyRoute>`, then add it. A hit that is not commerce (a lesson about
 * `git checkout`) takes `// not-commerce: <reason>` on its line or the line above.
 *
 * A tripwire for the known vocabulary and routes, not a proof: see the header of `shell-commerce.ts`.
 */
const GATED: Record<string, Gate> = {
  "src/App.tsx": { gate: "router" },
  "src/auth/RequireAuth.tsx": { gate: "reached-through", symbols: ["signedOutTo"] },
  "src/auth/RequireSubscription.tsx": { gate: "surface-branch", hits: 2 },

  "src/pages/SubscribePage.tsx": { gate: "web-only-route", page: "SubscribePage" },
  "src/pages/SubscribeReturnPage.tsx": { gate: "web-only-route", page: "SubscribeReturnPage" },
  "src/components/auth/AuthProgressSteps.tsx": { gate: "reached-through", symbols: ["AuthProgressSteps"] },
  "src/components/subscribe/PlanSummary.tsx": { gate: "reached-through", symbols: ["PlanSummary"] },
  "src/components/subscribe/SubscribeAccountBar.tsx": { gate: "reached-through", symbols: ["SubscribeAccountBar"] },
  "src/components/subscribe/SubscribeTrustLine.tsx": { gate: "reached-through", symbols: ["SubscribeTrustLine"] },
  "src/consts/planIncludes.ts": { gate: "reached-through", symbols: ["PLAN_INCLUDES"] },

  "src/pages/auth/AuthPage.tsx": { gate: "web-only" },
  "src/components/branded/AppHeader.tsx": { gate: "web-only" },
  "src/components/branded/LockedProgramView.tsx": { gate: "web-only" },
  "src/components/branded/VisitorBanner.tsx": { gate: "surface-branch", hits: 3 },
  "src/components/live/GuestEndCard.tsx": { gate: "web-only" },
  "src/pages/ProgramPage.tsx": { gate: "web-only" },

  "src/components/profile/SubscriptionSection.tsx": { gate: "reached-through", symbols: ["SubscriptionSection"] },
  "src/components/profile/CancelSubscriptionDialog.tsx": { gate: "reached-through", symbols: ["CancelSubscriptionDialog"] },
  "src/components/profile/ManageBillingButton.tsx": { gate: "reached-through", symbols: ["ManageBillingButton"] },
  "src/utils/formatBillingDate.ts": { gate: "reached-through", symbols: ["formatBillingDate"] },

  "src/hooks/useCatalogScreen.ts": { gate: "surface-branch", hits: 2 },
  "src/hooks/useHomeScreen.ts": { gate: "surface-branch", hits: 3 },
  "src/hooks/useBillingPortal.ts": { gate: "reached-through", symbols: ["useBillingPortal"] },
  "src/hooks/useCancelSubscription.ts": { gate: "reached-through", symbols: ["useCancelSubscription"] },
  "src/hooks/useCheckoutActivation.ts": { gate: "reached-through", symbols: ["useCheckoutActivation"] },
  "src/hooks/useCheckoutLanding.ts": { gate: "reached-through", symbols: ["useCheckoutLanding"] },
  "src/hooks/useSeatPricing.ts": { gate: "reached-through", symbols: ["useSeatPricing"] },
  "src/services/billing.service.ts": {
    gate: "reached-through",
    symbols: [
      "createCheckout",
      "setCancelAtPeriodEnd",
      "getPricing",
      "formatPrice",
      "createBillingPortalSession",
      "defaultReturnUrls",
      "AlreadySubscribedError",
    ],
  },
  "src/services/otpAuth.service.ts": { gate: "reached-through", symbols: ["sendSignupCode", "verifySignupCode"] },

  "src/lib/queryKeys.ts": { gate: "no-surface" },
  "src/services/entitlement.service.ts": { gate: "no-surface" },
  "src/types/checkoutActivation.ts": { gate: "no-surface" },
  "src/types/entitlement.ts": { gate: "no-surface" },
};

/**
 * Every `// not-commerce: <reason>` marker of the tree, as a count per file. A marker silences a
 * WORDING hit on its line or the next one, so each new marker is one visible line here.
 */
const NOT_COMMERCE_MARKERS: Record<string, number> = { "src/lib/pageTitle.ts": 2 };

/** Every string that names `/subscribe` or `/signup`, per file. A new call site is a visible edit of this list. */
const ROUTE_CALL_SITES: Record<string, number> = {
  "src/App.tsx": 4,
  "src/auth/RequireAuth.tsx": 1,
  "src/auth/RequireSubscription.tsx": 2,
  "src/components/branded/AppHeader.tsx": 1,
  "src/components/branded/LockedProgramView.tsx": 1,
  "src/components/branded/VisitorBanner.tsx": 1,
  "src/components/live/GuestEndCard.tsx": 1,
  "src/components/profile/SubscriptionSection.tsx": 1,
  "src/hooks/useCatalogScreen.ts": 1,
  "src/hooks/useHomeScreen.ts": 1,
  "src/pages/ProgramPage.tsx": 1,
  "src/pages/SubscribeReturnPage.tsx": 1,
  "src/pages/auth/AuthPage.tsx": 1,
  "src/services/billing.service.ts": 2,
  "src/services/otpAuth.service.ts": 1,
};

/** The key families of the dictionary that carry the wording. A worded key outside them is a new surface. */
const WORDED_KEY_FAMILIES =
  /^(subscribe\.|subscription\.|auth\.(signUp|signUpError|signUpTitle|signUpWith|toSignup|signup\.panelTitle|progress\.label|progress\.subscription)$|catalog\.locked\.cta$|home\.visitor\.body$|program\.locked\.hint$|live\.guest\.end\.(subtitle|cta)$)/;

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const real: Sources = {
  paths: execFileSync("git", ["ls-files", "-co", "--exclude-standard", "src", "packages/activities/src", "packages/screens/src", "packages/core/src"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
  read: (file) => readFileSync(path.join(ROOT, file), "utf8"),
};

describe("no subscription or sign-up surface inside the shell, the real tree", () => {
  it("every file with a commerce hit is on the closed list, behind a gate that holds", () => {
    expect(violations(real, GATED, NOT_COMMERCE_MARKERS)).toEqual([]);
  }, 60_000);

  it("lists every call site of /subscribe and /signup", () => {
    const counts: Record<string, number> = {};
    for (const h of scan(real)) if (h.kind === "route") counts[h.file] = (counts[h.file] ?? 0) + 1;
    expect(counts).toEqual(ROUTE_CALL_SITES);
  }, 60_000);

  it("every worded dictionary key belongs to a known family", () => {
    const keys = wordedKeys(real.read(DICTIONARY_FILE));
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.filter((k) => !WORDED_KEY_FAMILIES.test(k))).toEqual([]);
  }, 60_000);

  it("the neutral screen and the sign-out label carry no commerce wording", () => {
    const keys = new Set(wordedKeys(real.read(DICTIONARY_FILE)));
    expect(keys.has("shell.noAccess.title")).toBe(false);
    expect(keys.has("auth.logout")).toBe(false);
    expect(scan(real).filter((h) => h.file.startsWith("src/components/shell/"))).toEqual([]);
  }, 60_000);
});

const DICTIONARY = `
export const dict = {
  pt: {
    'nav.home': 'Início',
    'subscribe.cta': 'Assinar',
    'offer.banner': 'Assine e desbloqueie tudo',
    'auth.signUp': 'Criar conta',
  },
  en: {
    'nav.home': 'Home',
    'subscribe.cta': 'Subscribe',
    'offer.banner': 'Unlock everything',
    'auth.signUp': 'Create account',
  },
};
`;

const APP = `
export const App = () => (
  <Routes>
    <Route path="/" element={<RequireAuth><RequireSubscription mode="preview"><HomePage /></RequireSubscription></RequireAuth>} />
    <Route path="/subscribe" element={<WebOnlyRoute><RequireAuth><SubscribePage /></RequireAuth></WebOnlyRoute>} />
    <Route path="/admin" element={<AdminLayout />}>
      <Route path="roster" element={<RosterPage />} />
    </Route>
  </Routes>
);
`;

const HEADER = `
export function Header() {
  return (
    <nav>
      <a href="/">{t('nav.home')}</a>
      <WebOnly>
        <Link to="/subscribe">{t('subscribe.cta')}</Link>
      </WebOnly>
    </nav>
  );
}
`;

const BASE: Record<string, string> = {
  [DICTIONARY_FILE]: DICTIONARY,
  [APP_FILE]: APP,
  "src/components/Header.tsx": HEADER,
  "src/pages/SubscribePage.tsx": `export default function SubscribePage() { return <PriceTag label={t('subscribe.cta')} />; }`,
  "src/pages/HomePage.tsx": `export default function HomePage() { return visitor ? <p>{t('offer.banner')}</p> : <Dashboard />; }`,
  "src/components/PriceTag.tsx": `export function PriceTag({ label }: { label: string }) { return <b>{label} {t("subscribe.cta")}</b>; }`,
  "src/components/Plain.tsx": `export function Plain() { return <p>{t('nav.home')}</p>; }`,
};

const BASE_GATED: Record<string, Gate> = {
  [APP_FILE]: { gate: "router" },
  "src/components/Header.tsx": { gate: "web-only" },
  "src/pages/SubscribePage.tsx": { gate: "web-only-route", page: "SubscribePage" },
  "src/pages/HomePage.tsx": { gate: "behind-access-gate", page: "HomePage" },
  "src/components/PriceTag.tsx": { gate: "reached-through", symbols: ["PriceTag"] },
};

function fixture(files: Record<string, string>): Sources {
  const all = { ...BASE, ...files };
  return { paths: Object.keys(all), read: (file) => all[file] };
}

describe("no subscription or sign-up surface inside the shell, fixtures", () => {
  it("passes for a tree where every hit is gated", () => {
    expect(violations(fixture({}), BASE_GATED)).toEqual([]);
  });

  it("ignores tests, stories and comments", () => {
    const repo = fixture({
      "src/components/Plain.test.tsx": `it('x', () => render(<Link to="/subscribe" />));`,
      "src/components/Plain.stories.tsx": `export const S = () => <Link to="/signup" />;`,
      "src/components/Plain.tsx": `// sends nobody to /subscribe\n/* nor to /signup */\nexport function Plain() { return <p>{/* Assine agora */}ok</p>; }`,
    });
    expect(violations(repo, BASE_GATED)).toEqual([]);
  });

  it.each([
    ["a new link to /subscribe", `export function Promo() { return <Link to="/subscribe">go</Link>; }`, "route: /subscribe"],
    ["a new navigate('/signup')", `export function usePromo() { const n = useNavigate(); return () => n('/signup'); }`, "route: /signup"],
    ["a redirect built in a template", "export const next = (o: string) => `${o}/subscribe/return?ok=1`;", "route: /subscribe/return"],
    ["a worded dictionary key", `export function Promo() { return <p>{t('offer.banner')}</p>; }`, "wording: offer.banner"],
    ["a worded key in double quotes", `export function Promo() { return <p>{t("auth.signUp")}</p>; }`, "wording: auth.signUp"],
    ["wording written into the JSX", `export function Promo() { return <p>Assine agora e ganhe acesso</p>; }`, "wording: Assine agora"],
    ["a price written into a string", `export const label = 'Por apenas R$ 100 ao mês';`, "wording: Por apenas R$ 100"],
    ["a Stripe URL", `export const portal = 'https://billing.stripe.com/p/session';`, "stripe: https://billing.stripe.com"],
    ["a checkout call", `export async function go() { return createCheckout({ seats: 1 }); }`, "stripe: createCheckout"],
  ])("fails for %s in a file that is not on the list", (_what, code, expected) => {
    const found = violations(fixture({ "src/components/Promo.tsx": code }), BASE_GATED);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("src/components/Promo.tsx:1 is not on the closed list");
    expect(found[0]).toContain(expected);
  });

  it.each([
    ["a one-word link label", `export function Promo({ url }: { url: string }) { return <a href={url}>Assinar</a>; }`, "wording: Assinar"],
    ["a one-word label held in a constant", `export const LABEL = 'Upgrade';`, "wording: Upgrade"],
    ["an upgrade pitch", `export function Promo() { return <p>Faça upgrade para o Premium e desbloqueie tudo</p>; }`, "wording: Faça upgrade"],
    ["a buy pitch", `export function Promo() { return <p>Compre agora o acesso completo</p>; }`, "wording: Compre agora"],
    ["an external payment host", `export const pay = 'https://pay.hotmart.com/X123';`, "stripe: https://pay.hotmart.com/X123"],
    ["a pricing page URL", `export const more = 'https://iterahq.dev/pricing';`, "stripe: https://iterahq.dev/pricing"],
  ])("fails for %s (review finding 4)", (_what, code, expected) => {
    const found = violations(fixture({ "src/components/Promo.tsx": code }), BASE_GATED);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(expected);
  });

  it("scans the universal screens, which render in the browser and in the shell", () => {
    const found = violations(fixture({ "packages/screens/src/catalog/messages.ts": `export const M = { pt: { 'catalog.locked': 'Assine para desbloquear' } };` }), BASE_GATED);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("packages/screens/src/catalog/messages.ts:1 is not on the closed list");
  });

  it.each([
    ["git checkout in a lesson string", `export const hint = 'Use git checkout -b nova-branch';`],
    ["a git helper named after checkout", `export function checkoutBranch(name: string) { return name; }`],
    ["a study plan", `export function Week() { return <p>Seu plano de estudos da semana</p>; }`],
    ["a data-modelling exercise about a sign-up table", `export const task = 'Modele o cadastro de usuários';`],
    ["trial and error", `export const tip = 'Learning is trial and error';`],
    ["a flashcard", `export const tip = 'Vire o cartão para ver a resposta';`],
    ["a lowercase enum value", `export const tier = 'premium' as const;`],
  ])("passes for %s, with no marker (review finding 3)", (_what, code) => {
    expect(violations(fixture({ "src/components/Lesson.tsx": code }), BASE_GATED)).toEqual([]);
  });

  it("passes for a dictionary entry about git or a study plan", () => {
    const dictionary = DICTIONARY.replace("'nav.home': 'Início',", "'nav.home': 'Início',\n    'git.hint.co': 'Faça checkout da branch',\n    'lesson.plan.title': 'Seu plano de estudos',");
    const repo = fixture({ [DICTIONARY_FILE]: dictionary, "src/components/Lesson.tsx": `export function L() { return <p>{t('git.hint.co')} {t('lesson.plan.title')}</p>; }` });
    expect(wordedKeys(dictionary)).not.toContain("git.hint.co");
    expect(wordedKeys(dictionary)).not.toContain("lesson.plan.title");
    expect(violations(repo, BASE_GATED)).toEqual([]);
  });

  describe("the `not-commerce:` marker", () => {
    const FILE = "src/components/Lesson.tsx";
    const PINNED = { [FILE]: 1 };
    const hit = `export const a = 'O pagamento do boleto é o exemplo desta aula';`;
    const at = (code: string, markers: Record<string, number> = PINNED) => violations(fixture({ [FILE]: code }), BASE_GATED, markers);

    it("clears a wording hit on its own line or on the next line, when pinned", () => {
      expect(at(hit, {})).toHaveLength(1);
      expect(at(hit, {})[0]).toContain('comment "// not-commerce: <reason>"');
      expect(at(`${hit} // not-commerce: lesson copy about a billing domain model`)).toEqual([]);
      expect(at(`// not-commerce: lesson copy about a billing domain model\n${hit}`)).toEqual([]);
      expect(at(`/* not-commerce: lesson copy */\n${hit}`)).toEqual([]);
      expect(at(`export function L() {\n  return (\n    <p>\n      {/* not-commerce: lesson copy */}\n      Simule o pagamento de um pedido\n    </p>\n  );\n}`)).toEqual([]);
    });

    it("clears nothing two lines below, and needs a reason", () => {
      expect(at(`// not-commerce: lesson copy\n\n${hit}`)).toHaveLength(1);
      expect(at(`// not-commerce: lesson copy\nexport const b = 1;\n${hit}`)).toHaveLength(1);
      expect(at(`// not-commerce:\n${hit}`, {})).toHaveLength(1);
    });

    it("fails when the marker is not pinned, naming the file", () => {
      expect(at(`// not-commerce: lesson copy\n${hit}`, {})).toEqual([
        `${FILE} carries 1 not-commerce marker(s), NOT_COMMERCE_MARKERS says 0: pin the count in scripts/shell-commerce.test.ts`,
      ]);
      expect(at(`// not-commerce: one\n${hit}\n// not-commerce: two\n${hit.replace("const a", "const b")}`)).toEqual([
        `${FILE} carries 2 not-commerce marker(s), NOT_COMMERCE_MARKERS says 1: pin the count in scripts/shell-commerce.test.ts`,
      ]);
      expect(violations(fixture({}), BASE_GATED, { "src/gone.tsx": 1 })).toEqual(["src/gone.tsx is in NOT_COMMERCE_MARKERS and is not in the tree: remove it"]);
    });

    it("never silences a route, a payment host or a Stripe hit", () => {
      const link = at(`export function P() {\n  // not-commerce: just a link\n  return <Link to="/subscribe">ir</Link>; // not-commerce: really\n}`, { [FILE]: 2 });
      expect(link).toHaveLength(1);
      expect(link[0]).toContain(`${FILE}:3 is not on the closed list (route: /subscribe)`);
      expect(at(`// not-commerce: docs\nexport const pay = 'https://pay.hotmart.com/X123';`)[0]).toContain("stripe: https://pay.hotmart.com/X123");
      expect(at(`// not-commerce: docs\nexport const go = () => createCheckout({ seats: 1 });`)[0]).toContain("stripe: createCheckout");
    });

    it("is ignored inside a string literal or a JSX text", () => {
      const inString = at(`export const a = 'O pagamento do boleto // not-commerce: fake';`, {});
      expect(inString).toHaveLength(1);
      expect(inString[0]).toContain("is not on the closed list (wording");
      const lineAbove = at(`export const m = "// not-commerce: fake";\n${hit}`, {});
      expect(lineAbove).toHaveLength(1);
      expect(lineAbove[0]).toContain(`${FILE}:2 is not on the closed list`);
      const jsx = at(`export function L() {\n  return (\n    <p>\n      // not-commerce: fake\n      Simule o pagamento de um pedido\n    </p>\n  );\n}`, {});
      expect(jsx).toHaveLength(1);
      expect(jsx[0]).toContain("is not on the closed list (wording");
    });

    it("on a dictionary entry takes the key out of the worded keys, when pinned", () => {
      const dictionary = DICTIONARY.replace("'nav.home': 'Início',", "'nav.home': 'Início',\n    // not-commerce: the exercise models an invoice\n    'lesson.invoice': 'Calcule o pagamento da fatura',");
      const lesson = `export function L() { return <p>{t('lesson.invoice')}</p>; }`;
      expect(violations(fixture({ [DICTIONARY_FILE]: dictionary, [FILE]: lesson }), BASE_GATED, { [DICTIONARY_FILE]: 1 })).toEqual([]);
      expect(violations(fixture({ [DICTIONARY_FILE]: dictionary, [FILE]: lesson }), BASE_GATED)).toHaveLength(1);
      const bare = dictionary.replace("    // not-commerce: the exercise models an invoice\n", "");
      expect(violations(fixture({ [DICTIONARY_FILE]: bare, [FILE]: lesson }), BASE_GATED)).toHaveLength(1);
    });
  });

  it("fails for a second link of a listed file that sits outside <WebOnly>", () => {
    const code = HEADER.replace("</nav>", `<Link to="/subscribe">{t('nav.home')}</Link></nav>`);
    expect(violations(fixture({ "src/components/Header.tsx": code }), BASE_GATED)).toEqual([
      "src/components/Header.tsx:9 is outside <WebOnly> (route: /subscribe)",
    ]);
  });

  it("fails when a surface-branch file grows a hit, or stops reading the surface", () => {
    const banner = `export function Banner() { if (useShellSurface() !== 'web') return null; return <Link to="/subscribe">x</Link>; }`;
    const gated: Record<string, Gate> = { ...BASE_GATED, "src/components/Banner.tsx": { gate: "surface-branch", hits: 1 } };
    expect(violations(fixture({ "src/components/Banner.tsx": banner }), gated)).toEqual([]);
    expect(violations(fixture({ "src/components/Banner.tsx": banner.replace("x</Link>", "{t('subscribe.cta')}</Link>") }), gated)).toEqual([
      "src/components/Banner.tsx has 2 hits, the list says 1",
    ]);
    expect(violations(fixture({ "src/components/Banner.tsx": banner.replace("if (useShellSurface() !== 'web') return null; ", "") }), gated)).toEqual([
      "src/components/Banner.tsx does not read useShellSurface()",
    ]);
  });

  it("fails when a commerce route loses <WebOnlyRoute>", () => {
    const app = APP.replace("<WebOnlyRoute><RequireAuth><SubscribePage /></RequireAuth></WebOnlyRoute>", "<RequireAuth><SubscribePage /></RequireAuth>");
    const found = violations(fixture({ [APP_FILE]: app }), BASE_GATED);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain("src/App.tsx: a commerce <Route> is not wrapped in <WebOnlyRoute>");
    expect(found[1]).toBe("src/pages/SubscribePage.tsx: <SubscribePage /> is mounted outside <WebOnlyRoute>");
  });

  it("fails when a new route path names /signup without <WebOnlyRoute>", () => {
    const app = APP.replace("<Route path=\"/admin\"", `<Route path="/signup" element={<Plain />} />\n    <Route path="/admin"`);
    const found = violations(fixture({ [APP_FILE]: app }), BASE_GATED);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("a commerce <Route> is not wrapped in <WebOnlyRoute>");
  });

  it("fails when a page with locked copy is mounted outside <RequireSubscription>", () => {
    const app = APP.replace(`<RequireSubscription mode="preview"><HomePage /></RequireSubscription>`, "<HomePage />");
    expect(violations(fixture({ [APP_FILE]: app }), BASE_GATED)).toEqual([
      "src/pages/HomePage.tsx: <HomePage /> is mounted outside <RequireSubscription>",
    ]);
  });

  it("fails when an unlisted file uses a symbol of a reached-through file, unless inside <WebOnly>", () => {
    const outside = `import { PriceTag } from './PriceTag';\nexport function Plain() { return <PriceTag label="x" />; }`;
    expect(violations(fixture({ "src/components/Plain.tsx": outside }), BASE_GATED)).toEqual([
      "src/components/Plain.tsx names PriceTag of src/components/PriceTag.tsx and is not on the closed list",
    ]);
    const inside = `import { PriceTag } from './PriceTag';\nexport function Plain() { return <WebOnly><PriceTag label="x" /></WebOnly>; }`;
    expect(violations(fixture({ "src/components/Plain.tsx": inside }), BASE_GATED)).toEqual([]);
    const barrel = `export { PriceTag } from './PriceTag';`;
    expect(violations(fixture({ "src/components/index.ts": barrel }), BASE_GATED)).toEqual([]);
  });

  it("fails for a no-surface file that renders or routes", () => {
    const gated: Record<string, Gate> = { ...BASE_GATED, "src/types/billing.ts": { gate: "no-surface" } };
    expect(violations(fixture({ "src/types/billing.ts": `export interface CheckoutResponse { id: string }` }), gated)).toEqual([]);
    expect(violations(fixture({ "src/types/billing.ts": `export interface CheckoutResponse { id: string }\nexport const back = '/subscribe';` }), gated)).toEqual([
      "src/types/billing.ts:2 carries a route hit (/subscribe): it is not data only",
    ]);
  });

  it("fails for a stale entry of the list", () => {
    const gated: Record<string, Gate> = { ...BASE_GATED, "src/components/Plain.tsx": { gate: "web-only" } };
    expect(violations(fixture({}), gated)).toEqual(["src/components/Plain.tsx is on the closed list and has no hit: remove it"]);
  });

  it("does not take a longer path for a commerce route", () => {
    const repo = fixture({ "src/components/Plain.tsx": `export const a = '/subscribers'; export const b = '/signup-codes';` });
    expect(violations(repo, BASE_GATED)).toEqual([]);
  });
});
