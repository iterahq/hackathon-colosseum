/**
 * E2E — one activity PER KIND driven through the isolated author test harness.
 *
 * Plan `20260728-itera-activity-testing`, **Fase 4 / tier T3**. Deliberately
 * FINE: per kind it asserts only "the page loads · `data-activity-kind` is the
 * expected one · the activity accepts input · a verdict/completion is reached".
 * It does NOT enumerate the state matrix (axes A–I) — that is T0/T1/T2's job
 * (`answerMachine` unit tests, story smoke, portable-story interaction). If you
 * find yourself adding a second case for the same kind here, it belongs in T1.
 *
 * ## Where this runs — ADR-3, binding
 *
 * `.github/workflows/e2e.yml` ONLY (workflow_dispatch + a WEEKLY cron, Monday
 * 06:00 UTC — it was daily until 2026-08-13; Tainan asked for weekly).
 * **Never `ci.yml`.** Playwright stays out of the per-PR gate.
 *
 * ## ⚠️ Which persona this run actually represents
 *
 * `ITERA_SMOKE_*` is `itera-smoke@iterahq.dev`. It is NOT a clean learner, and
 * as of 2026-07-28 it is NOT `author` in `dfl-batch` either. So a green run
 * here proves an AUTHOR/TENANT-ADMIN surface — nothing about the learner path,
 * and nothing about content owned by a tenant this identity cannot author in.
 *
 * That has a direct, measurable consequence: RLS scopes discovery to
 * `itera.current_author_tenant_ids()`. The other kinds live in `dfl-batch` /
 * `plg-*` and are INVISIBLE to this identity, so their cases skip with an
 * explicit reason. **A run that is green-with-skips proves the gating works —
 * it does NOT prove those kinds work.** The skip census prints every one of
 * them at the end of the run, so this can no longer be mistaken for coverage.
 *
 * ### Which tenants that is, and why it is changing
 *
 * Plan `20260813-itera-test-identity-tenant-isolation` moves the test
 * identities into the `qa-e2e` tenant so they stop being counted as real
 * learners. Round-1 question, answered **A** by Tainan on 2026-08-13:
 * `itera-smoke` leaves the `itera` tenant, and the specs that depend on it
 * being `tenant_admin` there point at QA-tenant content instead.
 *
 * | when | tenants this identity may author in | kinds the crawl reaches |
 * |---|---|---|
 * | before the revoke | `itera` + `qa-e2e` | quiz · document · diagram · single_choice · **order** |
 * | after the revoke, before this fix | `qa-e2e` only | quiz · document · diagram · single_choice |
 * | now | `qa-e2e` only | quiz · document · diagram · single_choice · order |
 *
 * `db/seeds/qa-tenant.fixture.json` is what holds that last row up: unit 1
 * seeds `quiz`, `diagram` and `order` into the QA tenant. Read that unit's
 * `_comment` for the reasoning. Run `npm run seed:qa-tenant` after pulling this
 * change; the seed is idempotent.
 *
 * ⚠️ THE MIDDLE ROW IS THE LESSON, and it is not hypothetical — it was true
 * for part of 2026-08-13. The seed shipped with `quiz` and `diagram`, from a
 * hand-written list of what `itera` lent the crawl. The list MISSED `order`:
 * `itera` published two `order` activities in `lcpwci-matriz-gramatica-v0`,
 * units 1 and 3, both inside `MAX_UNITS`. So the revoke cut coverage from five
 * kinds to four, and this spec REPORTED SUCCESS while it happened, because an
 * unreachable kind becomes `skipBlocked` and a skip does not fail a run.
 *
 * Two rules follow. Do not "simplify" by deleting unit 1 — that repeats the
 * loss on purpose. And never state what the crawl reaches from prose: derive
 * it, as `itera-smoke` with RLS enforced, from
 * `itera.current_author_tenant_ids()`, and compare it against `CASES` below.
 *
 * To cover a kind this persona cannot see, provision an identity that can (e.g.
 * `ITERA_E2E_AUTHOR_*`) — do not relabel the smoke user as something it is not.
 *
 * ## Zero DB writes — verified, not assumed
 *
 * Read `src/components/author/ActivityTestHarness.tsx`: `onComplete` lands in
 * React local state and nowhere else. The only persistence paths in the app are
 * `persistActivityProgress` (`src/services/progress.service.ts`) and
 * `saveArtifact` (`src/services/artifact.service.ts`); grep shows their only
 * callers are `src/pages/LessonPlayer.tsx` and `src/pages/LiveSessionPage.tsx`
 * — neither is on the `/author/activities/:id/test` route. The one thing the
 * harness path does write is `localStorage` (code-snack autosave,
 * `codeSnapshot.service.ts`), which dies with the browser context. So this spec
 * writes nothing to `itera.progress`, `itera.activity_results`, `xp_events` or
 * `itera.artifacts`, which is what makes it safe on a cron against prod.
 *
 * ## Activity ids — discovered at runtime, not hardcoded
 *
 * Hardcoded UUIDs rot. Discovery walks the author surface the same way a human
 * would: `/author` → unit canvases → `[data-testid=canvas-cell]`, whose
 * `data-activity-id` + `data-activity-kind` attributes already exist for the
 * canvas's own purposes. `ITERA_SMOKE_ACTIVITY_IDS` (a JSON `{kind: id}` map)
 * pins specific ids and short-circuits discovery for those kinds.
 *
 * Gated through `e2e/support/gate.ts`. `ITERA_SMOKE_*` is a **required**
 * capability (`e2e.yml` declares it), so its absence fails the preflight — this
 * spec is the biggest thing that has never run. "No activity of that kind
 * visible to this persona" stays a skip, but a LOUD one: it is counted by the
 * skip census and reported as UNVERIFIED, never as a pass.
 *
 * Run:
 *   ITERA_BASE_URL=https://app.iterahq.dev \
 *   ITERA_SMOKE_USERNAME=… ITERA_SMOKE_PASSWORD=… \
 *   npx playwright test e2e/author-activity-kinds.spec.ts
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ITERA_BASE_URL } from './support/capabilities';
import { requireCapabilities, skipBlocked } from './support/gate';
import { dragOrderRow } from './support/orderDrag';

const BASE = ITERA_BASE_URL;
const USER = process.env.ITERA_SMOKE_USERNAME ?? '';
const PASS = process.env.ITERA_SMOKE_PASSWORD ?? '';

/** Credentials present? `beforeAll` cannot log in without them. */
const READY = Boolean(USER && PASS);

/** Bound the crawl — discovery is a means, not the test. */
const MAX_UNITS = Number(process.env.ITERA_SMOKE_MAX_UNITS ?? 8);

/**
 * How deep this tier drives a given kind.
 *  - `verdict` — drive real input all the way to the harness verdict row.
 *  - `render`  — assert it mounts and exposes its input affordance, and stop.
 *    Duas razões levam um kind pra cá. Verdict dependente do conteúdo
 *    (`code` precisa dos checks autorais passarem num sandbox Monaco/iframe;
 *    `chat_sandbox` precisa de uma caminhada multi-passo no ChatModel) —
 *    dirigir esses até o veredito num smoke genérico embutiria suposição de
 *    conteúdo e flakearia; suas máquinas de estado estão cobertas em T0/T1. E
 *    kinds de CONTEÚDO (`concept`, `diagram`, `video`, e o `document` de corpo
 *    só-leitura), que desde 03/08/2026 não têm conclusão nenhuma a clicar.
 */
type Depth = 'verdict' | 'render';

interface KindCase {
  kind: string;
  depth: Depth;
  /** Drive the activity. Returns nothing; assertions live inside. */
  drive: (page: Page) => Promise<void>;
}

/** Click the first enabled element matching a testid, if any. */
async function clickFirst(page: Page, testId: string) {
  const el = page.getByTestId(testId).first();
  await expect(el).toBeVisible();
  await el.click();
}

/** The shared "Marcar como concluída" affordance (exercise kinds). */
async function markDone(page: Page) {
  await clickFirst(page, 'activity-done');
}

/** Conteúdo: montou e nada há para responder — não existe conclusão a clicar. */
async function expectContent(page: Page) {
  await expect(page.getByTestId('activity-shell').first()).toBeVisible();
  await expect(page.getByTestId('activity-done')).toHaveCount(0);
}

const CASES: KindCase[] = [
  {
    kind: 'quiz',
    depth: 'verdict',
    drive: async (page) => {
      await clickFirst(page, 'quiz-option');
      await clickFirst(page, 'quiz-submit');
    },
  },
  {
    kind: 'document',
    // `render`: das duas formas que dividem o kind, só a reflexão (textarea +
    // min_words) conclui. A de corpo só-leitura é conteúdo, e conteúdo não
    // conclui — então esperar veredito aqui depende de qual das duas o crawler
    // achou primeiro.
    depth: 'render',
    drive: async (page) => {
      const input = page.getByTestId('document-reflection-input');
      if (!(await input.count())) {
        await expect(page.getByTestId('document-prompt')).toBeVisible();
        return;
      }
      await input.first().fill(
        'Esta é uma resposta de smoke automatizado escrita para satisfazer o ' +
          'requisito de contagem mínima de palavras da atividade de reflexão ' +
          'sem depender do conteúdo específico do curso avaliado aqui hoje.'
      );
      await markDone(page);
      await expect(page.getByTestId('test-verdict')).toBeVisible();
    },
  },
  { kind: 'diagram', depth: 'render', drive: expectContent },
  { kind: 'concept', depth: 'render', drive: expectContent },
  {
    kind: 'concept_reveal',
    // `render`, não `verdict`: revelar não é submeter — o card abre e nada é
    // enviado, então não existe veredito para esperar.
    depth: 'render',
    drive: async (page) => {
      await expect(page.getByTestId('concept-reveal-card')).toBeVisible();
      // Ao vivo o card já nasce aberto e o botão não existe — os dois caminhos
      // são corretos, e o que importa é a resposta estar acessível no fim.
      const show = page.getByTestId('concept-reveal-show');
      if (await show.count()) await show.first().click();
      await expect(page.getByTestId('concept-reveal-answer')).toBeVisible();
    },
  },
  { kind: 'video', depth: 'render', drive: expectContent },
  {
    kind: 'single_choice',
    depth: 'verdict',
    drive: async (page) => {
      await clickFirst(page, 'single-choice-option');
      await clickFirst(page, 'single-choice-submit');
    },
  },
  {
    kind: 'multi_choice',
    depth: 'verdict',
    drive: async (page) => {
      await clickFirst(page, 'multi-choice-option');
      await clickFirst(page, 'multi-choice-submit');
    },
  },
  {
    kind: 'match',
    depth: 'verdict',
    drive: async (page) => {
      // Tap-to-pair, NOT drag: arm a left card, then tap a right card. The tap
      // path is what keeps this kind drivable outside browser mode (ADR-8).
      await clickFirst(page, 'match-left-card');
      await clickFirst(page, 'match-right-card');
      await clickFirst(page, 'match-submit');
    },
  },
  {
    kind: 'order',
    depth: 'verdict',
    drive: async (page) => {
      // The list starts in an answerable state; drag a row so the submit is a
      // real learner action rather than an accident of the initial order.
      if ((await page.getByTestId('order-item').count()) >= 2) await dragOrderRow(page, 0, 1);
      await clickFirst(page, 'order-submit');
    },
  },
  {
    kind: 'code',
    depth: 'render',
    drive: async (page) => {
      // Either the snack pane mounted, or the spec failed Zod and degraded to
      // the friendly invalid card — both are correct, neither is a crash.
      const pane = page.locator('[data-activity-kind="code"]').first();
      await expect(pane).toBeVisible();
      const invalid = page.getByTestId('code-invalid');
      if (await invalid.count()) return;
      await expect(page.getByTestId('code-submit').or(page.getByTestId('activity-done')).first()).toBeVisible();
    },
  },
  {
    kind: 'chat_sandbox',
    depth: 'render',
    drive: async (page) => {
      const invalid = page.getByTestId('sandbox-invalid');
      if (await invalid.count()) return;
      await expect(page.getByTestId('sandbox-window')).toBeVisible();
      // Whichever input affordance this scenario authored must be reachable.
      await expect(
        page
          .getByTestId('sandbox-send')
          .or(page.getByTestId('sandbox-choices'))
          .or(page.getByTestId('sandbox-slots'))
          .or(page.getByTestId('sandbox-seed-row'))
          .first()
      ).toBeVisible();
    },
  },
];

/** kind -> activityId, populated once in beforeAll. */
const FOUND = new Map<string, string>();
/** Why a kind has no id, for a skip reason that actually explains itself. */
let discoverySummary = 'discovery did not run';

let ctx: BrowserContext;
let page: Page;

async function login(p: Page) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel(/e-?mail/i).fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  // testid, not the accessible name: "Entrar" also matches the federated
  // "Entrar com DFL" button, which is a different flow entirely.
  await p.getByTestId('submit-login').click();
  await p.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
}

/** Let the guards + the lazily-loaded /author chunk settle (PR #196). */
async function settle(p: Page) {
  await p.waitForLoadState('networkidle').catch(() => {});
  await expect(p.getByText(/^Loading…$/)).toHaveCount(0, { timeout: 45_000 }).catch(() => {});
}

/** Walk /author -> unit canvases, harvesting one activity id per kind. */
async function discover(p: Page) {
  const pinned = process.env.ITERA_SMOKE_ACTIVITY_IDS;
  if (pinned) {
    for (const [kind, id] of Object.entries(JSON.parse(pinned) as Record<string, string>)) {
      if (id) FOUND.set(kind, id);
    }
  }

  const wanted = new Set(CASES.map((c) => c.kind));
  if ([...wanted].every((k) => FOUND.has(k))) {
    discoverySummary = 'all kinds pinned via ITERA_SMOKE_ACTIVITY_IDS';
    return;
  }

  await p.goto(`${BASE}/author`);
  await settle(p);

  const unitHrefs = await p
    .getByTestId('author-unit-link')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''));
  const units = unitHrefs.filter(Boolean).slice(0, MAX_UNITS);

  let scanned = 0;
  for (const href of units) {
    if ([...wanted].every((k) => FOUND.has(k))) break;
    await p.goto(`${BASE}${href}`);
    await settle(p);
    scanned += 1;
    const cells = await p
      .getByTestId('canvas-cell')
      .evaluateAll((els) =>
        els.map((e) => ({
          id: e.getAttribute('data-activity-id') ?? '',
          kind: e.getAttribute('data-activity-kind') ?? '',
        }))
      );
    for (const { id, kind } of cells) {
      if (id && kind && !FOUND.has(kind)) FOUND.set(kind, id);
    }
  }

  discoverySummary =
    // The tenant is NOT named here on purpose. It used to say "tenant_admin
    // (itera)", which stopped being true the day the revoke ran and then
    // misreported every skip reason for the rest of that run.
    `scanned ${scanned}/${units.length} unit canvas(es) in this identity's author scope; ` +
    `kinds visible: ${[...FOUND.keys()].sort().join(', ') || 'none'}`;
  // Surfaced in the run log so a green-with-skips run is self-explaining.
  console.log(`[author-activity-kinds] ${discoverySummary}`);
}

test.describe.configure({ mode: 'serial' });

test.describe('author test harness — one activity per kind', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    if (!READY) return;
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await login(page);
    await discover(page);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  for (const { kind, depth, drive } of CASES) {
    test(`${kind} — loads, accepts input, ${depth === 'verdict' ? 'reaches a verdict' : 'exposes its input'}`, async () => {
      await requireCapabilities('itera-player', 'itera-smoke');
      const id = FOUND.get(kind);
      if (!id) {
        skipBlocked(
          `no '${kind}' activity is visible to this persona. ${discoverySummary}. ` +
            `This is a SKIP, not a pass — the kind is UNVERIFIED. Pin one with ITERA_SMOKE_ACTIVITY_IDS ` +
            `or use an identity whose tenant authors this kind.`
        );
      }

      await page.goto(`${BASE}/author/activities/${id}/test`);
      await settle(page);

      // The route's own failure modes are distinguishable (#197) — say which.
      await expect(page.getByTestId('activity-not-found')).toHaveCount(0);
      await expect(page.getByTestId('test-load-error')).toHaveCount(0);
      await expect(page.getByTestId('activity-test-harness')).toBeVisible();

      // The renderer dispatched to the kind we asked for.
      await expect(page.locator(`[data-activity-kind="${kind}"]`).first()).toBeVisible();
      await expect(page.locator('[data-activity-kind="unknown"]')).toHaveCount(0);

      await drive(page);

      if (depth === 'verdict') {
        // The in-memory sink rendered a verdict, and labelled it "not saved".
        const verdict = page.getByTestId('test-verdict');
        await expect(verdict).toBeVisible();
        await expect(verdict).toHaveAttribute('data-correct', /^(true|false)$/);
        await expect(page.getByTestId('test-reset')).toBeVisible();
      }
    });
  }
});
