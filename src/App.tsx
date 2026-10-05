import { lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@devfellowship/components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ObservabilityProvider } from "@devfellowship/observability";
import HomePage from "./pages/HomePage";
import CatalogPage from "./pages/CatalogPage";
import ProgramPage from "./pages/ProgramPage";
import LessonPlayer from "./pages/LessonPlayer";
import ArtifactsPage from "./pages/ArtifactsPage";
import LiveSessionPage from "./pages/LiveSessionPage";
import InstructorClassPage from "./pages/live/InstructorClassPage";
import InstructorSessionPage from "./pages/live/InstructorSessionPage";
import InstructorReportPage from "./pages/live/InstructorReportPage";
import NotFound from "./pages/NotFound";
import SubscribePage from "./pages/SubscribePage";
import ProfilePage from "./pages/ProfilePage";
import SubscribeReturnPage from "./pages/SubscribeReturnPage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import DflCallbackPage from "./pages/auth/DflCallbackPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import OtpLoginPage from "./pages/auth/OtpLoginPage";
import { AuthProvider } from "./auth/AuthContext";
import { PersonalizationProvider } from "./personalization/PersonalizationProvider";
// The app side of ADR-3: injects i18n + the learner identity into
// `@iterahq/activities`, which cannot import either. See the file.
import { IteraActivityHost } from "./components/branded/activity/IteraActivityHost";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { RequireSubscription } from "./auth/RequireSubscription";
import { ShellBridgeMount } from "./lib/shellBridge";
import { KeepAwakeRouteMount } from "./lib/shellKeepAwake";
import { ShellAuthSessionMount } from "./lib/shellAuthSession";
/* ── Code-split surfaces (lazy) ───────────────────────────────────────────
   /admin/* and /author/* are staff surfaces: role-gated, and never rendered in
   the overwhelmingly common learner session. Statically importing them pulled
   their whole dependency cone into the single entry chunk every learner
   downloads. `lazy()` moves them to their own chunks, fetched on first visit.

   The route GUARDS are unchanged. Each <Suspense> sits INSIDE
   RequireAuth/RequireRole (never around them), so authorization is still
   decided first and an unauthorized user is redirected without the chunk ever
   being requested. See the routes below. */
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const RosterPage = lazy(() => import("./pages/admin/RosterPage"));
const CompletionPage = lazy(() => import("./pages/admin/CompletionPage"));
const EngagementPage = lazy(() => import("./pages/admin/EngagementPage"));
const ReplayPage = lazy(() => import("./pages/admin/ReplayPage"));
const ReplaySessionPage = lazy(() => import("./pages/admin/ReplaySessionPage"));
const AdminArtifactsPage = lazy(() => import("./pages/admin/AdminArtifactsPage"));
const AuthorHomePage = lazy(() => import("./pages/author/AuthorHomePage"));
const UnitCanvasPage = lazy(() => import("./pages/author/UnitCanvasPage"));
const ActivityTestPage = lazy(() => import("./pages/author/ActivityTestPage"));
// ADDITIVE (BYOC live wiring): opt-in sibling of the /test route that exercises
// the REAL responder+judge live path. Does not replace or alter /test.
const LiveActivityTestPage = lazy(() => import("./pages/author/LiveActivityTestPage"));
// Public prototype of the future `scene` kind: static, no data, no auth.
const ScenePrototypePage = lazy(() => import("./pages/prototype/ScenePrototypePage"));
import { Navigate } from "react-router-dom";
import { I18nProvider } from "./i18n";
import { EmbedBridgeMount } from "./auth/EmbedBridgeMount";
import { AppWideMounts } from "./components/AppWideMounts";
import GuestLiveRoute from "./pages/GuestLiveRoute";
import { LiveEntryRoleGate } from "./components/live/LiveEntryRoleGate";
import { GUEST_ROUTE_PATH } from "./guest/guestRoute";

const queryClient = new QueryClient();

/**
 * Suspense shell for a lazily-loaded FULL-PAGE route. Deliberately the same
 * markup RequireAuth/RequireRole already render while they resolve, so the
 * hand-off guard → chunk fetch → page is visually seamless.
 */
function LazyRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/**
 * Suspense shell for a lazily-loaded route that renders INSIDE an existing
 * layout shell (the /admin children mount in AdminLayout's <Outlet/>). Inline
 * rather than full-screen, so the admin header + sub-nav stay put while the
 * panel chunk arrives.
 */
function LazyPanel({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="py-16 text-center text-muted-foreground">Loading…</div>}>
      {children}
    </Suspense>
  );
}

/**
 * Hard OFF switch for telemetry export, for hermetic builds only.
 *
 * `@devfellowship/observability` turns itself ON whenever
 * `import.meta.env.PROD` is true, and `VITE_OTEL_ENABLED=false` does NOT turn
 * it off (the package reads `VITE_OTEL_ENABLED === "true" || PROD`). So every
 * `vite build` — including the stub-origin build of the `activity-baseline`
 * gate — sends spans to https://otel.devfellowship.com. That request broke the
 * gate's "nothing leaves the stub origin" test at random, depending on whether
 * the span batch flushed before the test ended.
 *
 * `VITE_OTEL_DISABLED=true` forces `enabled={false}`. Any other value (or no
 * value) passes `undefined`, so the package default stays in force and real
 * production keeps its traces. Only `playwright.baseline.config.ts` sets it.
 */
const otelEnabled = import.meta.env.VITE_OTEL_DISABLED === "true" ? false : undefined;

const App = () => (
  <ObservabilityProvider enabled={otelEnabled}>
    <I18nProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <PersonalizationProvider>
          <TooltipProvider>
            {/* ADR-3 host adapter for @iterahq/activities. Mounted here, not
                around <ActivityRenderer>, because activities are mounted from
                four places and forgetting one fails SILENTLY — see the file.
                Left un-reindented on purpose: this PR moves ~20 files already,
                and a 320-line whitespace diff here would bury the one line that
                matters and collide with every open PR. */}
            <IteraActivityHost>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <EmbedBridgeMount />
              <ShellBridgeMount />
              <KeepAwakeRouteMount />
              <ShellAuthSessionMount />
              {/* App-wide mounts: locale sync (writes itera.users.locale) + the
                  "a class went live" signal (reads memberships, deep-links into
                  the authenticated /live/:id). BOTH are suppressed on the guest
                  route — see AppWideMounts. They live inside the router now
                  precisely so that decision can be route-keyed. */}
              <AppWideMounts />
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                {/* Self-serve registration — public (pre-auth), same level as
                    /login. The landing site points "Criar conta" here; the page
                    creates the account passwordlessly and lands on /subscribe,
                    because a fresh account is entitled to nothing. */}
                <Route path="/signup" element={<SignupPage />} />
                {/* Password recovery — /auth/forgot requests the email link
                    (public); /auth/reset is where the link lands (the recovery
                    token signs the user in via detectSessionInUrl). */}
                <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
                <Route path="/auth/reset" element={<ResetPasswordPage />} />
                {/* Passwordless sign-in (B6) — request a one-time code / magic
                    link and verify it here. Public (pre-auth). */}
                <Route path="/auth/code" element={<OtpLoginPage />} />
                {/* "Sign in with DFL" callback — exchanges the DFL token (from
                    the URL fragment) for an Itera session. Public (pre-auth). */}
                <Route path="/auth/dfl/callback" element={<DflCallbackPage />} />
                {/* Learner surfaces — RequireAuth → RequireSubscription. A
                    signed-in user with no active subscription is redirected to
                    /subscribe (tenant-admins/owners are exempt). PLG gate:
                    plan 20260624-itera-plg-subscribe-flow.
                    VISITOR MODE (2026-09-18, plan 20260918-visitor-mode):
                    `mode="preview"` on "/", "/catalog" and "/program/:slug"
                    lets a signed-in user with no subscription THROUGH instead
                    of redirecting — the page itself renders a locked "subscribe
                    to unlock" experience (see useAccessLevel). "/lesson/:lessonId"
                    and "/artifacts" below keep the default mode="block": real
                    activity content is RLS-gated anyway
                    (itera.current_user_is_entitled()). */}
                <Route
                  path="/"
                  element={
                    <RequireAuth>
                      <RequireSubscription mode="preview">
                        <HomePage />
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                {/* Self-serve catalog — browse + enroll into catalog courses
                    (round-1 finding #1). A visitor (no subscription) can still
                    browse it (mode="preview"); the enroll CTA is replaced by a
                    "subscribe to unlock" CTA for them (CatalogPage), so enroll
                    is never called without an active seat. */}
                <Route
                  path="/catalog"
                  element={
                    <RequireAuth>
                      <RequireSubscription mode="preview">
                        <CatalogPage />
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/program/:slug"
                  element={
                    <RequireAuth>
                      <RequireSubscription mode="preview">
                        <ProgramPage />
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/lesson/:lessonId"
                  element={
                    <RequireAuth>
                      <RequireSubscription>
                        <LessonPlayer />
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                {/* "Meu repositório" — everything the learner has produced, in
                    the git-shaped folder structure (plan
                    20260728-itera-artifact-storage, Phase 2). Target of the
                    save toast AND a first-class navbar entry. */}
                <Route
                  path="/artifacts"
                  element={
                    <RequireAuth>
                      <RequireSubscription>
                        <ArtifactsPage />
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                {/* Self-profile — edit display name + photo/gamified icon.
                    Auth-gated only (NOT subscription-gated): identity stays
                    editable without an active plan, like /subscribe. */}
                <Route
                  path="/profile"
                  element={
                    <RequireAuth>
                      <ProfilePage />
                    </RequireAuth>
                  }
                />
                {/* Self-serve subscribe surface (PLG). Calls itera-api
                    POST /plg/checkout (user-JWT, Stripe SANDBOX) — see
                    services/billing.service.ts. Public-after-auth (NOT
                    subscription-gated, else it'd be a redirect loop).
                    `signedOutTo="/signup"`: this is where every landing CTA
                    points, so the signed-out visitor here is a prospect without
                    an account, not a learner who forgot to sign in. */}
                <Route
                  path="/subscribe"
                  element={
                    <RequireAuth signedOutTo="/signup">
                      <SubscribePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/subscribe/return"
                  element={
                    <RequireAuth>
                      <SubscribeReturnPage />
                    </RequireAuth>
                  }
                />
                {/* Live-class / real-time cohort mode (plan 20260702-…).
                    Professor control surface — instructor-gated. Static
                    `/live/instructor` is declared BEFORE the dynamic
                    `/live/:sessionId` so it is never captured as a sessionId.
                    The per-tenant enable gate is enforced in-app (the page shows
                    a "not enabled" state for a non-enabled tenant). */}
                <Route
                  path="/live/instructor"
                  element={
                    <RequireAuth>
                      <RequireRole role="instructor">
                        <InstructorClassPage />
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                {/* Post-class report — instructor-gated, reads the durable
                    class_answers/class_attendance rows (RLS staff-scoped).
                    Declared BEFORE the dynamic `/live/instructor/:sessionId` so
                    the static `report` segment always wins for report paths. */}
                <Route
                  path="/live/instructor/report/:sessionId"
                  element={
                    <RequireAuth>
                      <RequireRole role="instructor">
                        <InstructorReportPage />
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                {/* Instructor view of ONE session — deep-linkable, reloadable
                    (plan 20260723-itera-live-routed-session-and-index). Loads the
                    session by :sessionId; an ended / not-found id redirects to the
                    index with a notice (never a 404). */}
                <Route
                  path="/live/instructor/:sessionId"
                  element={
                    <RequireAuth>
                      <RequireRole role="instructor">
                        <InstructorSessionPage />
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                {/* Student live-session surface — reuses the activity components in
                    session mode (server-authoritative pointer). RLS + the in-app
                    enable gate scope visibility; the subscription gate matches the
                    other learner surfaces (it was the one paid surface left open,
                    and it is the most expensive one — realtime + LLM). A tenant
                    that gives the class away (`tenants.subscription_exempt`,
                    db/migrations/0055) reads as entitled, so a free cohort
                    still walks in. `graceOnError` só aqui: uma leitura que falha
                    no wifi da escola não pode derrubar o aluno no meio da aula.
                    Guests come through /g/:code, never here. */}
                {/* `LiveEntryRoleGate`: um tenant_admin/owner é staff E aluno,
                    e o link da aula não diz qual dos dois ele quer ser — ele
                    escolhe o lado antes de a sessão montar (escolher professor
                    manda para `/live/instructor/:sessionId`). Aluno e
                    instrutor sem cargo de admin passam direto. */}
                <Route
                  path="/live/:sessionId"
                  element={
                    <RequireAuth>
                      <RequireSubscription graceOnError>
                        <LiveEntryRoleGate>
                          <LiveSessionPage />
                        </LiveEntryRoleGate>
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                {/* GUEST live surface (plan 20260728-itera-guest-link-aula-sincrona,
                    ADR-3) — `/g/:code`, deliberately mounted OUTSIDE RequireAuth
                    and RequireSubscription. Someone with NO account opens the
                    link the professor copied in the reception, picks a name +
                    avatar, and joins the class. The gate is STRUCTURAL: nothing
                    in this subtree renders an auth guard, and every exit inside
                    it lands on the guest end-card (CTA to /signup, ADR-7) — a
                    guest can never fall through into the authenticated app.
                    It renders the SAME LiveSessionPage in guest mode; content
                    comes from itera-api because the guest holds ZERO memberships
                    (ADR-2/B5) and therefore reads no lesson rows at all. */}
                <Route path={GUEST_ROUTE_PATH} element={<GuestLiveRoute />} />

                {/* Tenant-admin observability (plan #6) — role-gated, READ-ONLY,
                    single-tenant. NO authoring routes exist here by design
                    (authoring lives in dfl-lms-admin) — ADR-5. RequireAuth →
                    RequireRole: a learner hitting /admin is redirected to "/". */}
                <Route
                  path="/admin"
                  element={
                    <RequireAuth>
                      <RequireRole role="tenant_admin">
                        <LazyRoute>
                          <AdminLayout />
                        </LazyRoute>
                      </RequireRole>
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="roster" replace />} />
                  <Route
                    path="roster"
                    element={
                      <LazyPanel>
                        <RosterPage />
                      </LazyPanel>
                    }
                  />
                  <Route
                    path="programs"
                    element={
                      <LazyPanel>
                        <CompletionPage />
                      </LazyPanel>
                    }
                  />
                  <Route
                    path="engagement"
                    element={
                      <LazyPanel>
                        <EngagementPage />
                      </LazyPanel>
                    }
                  />
                  {/* Replay of a recorded attempt (plan
                      20260803-itera-replay-de-sessao-de-atividade, Fase 1).
                      ⚠️ ADMIN OF THE LEARNER'S TENANT ONLY — Tainan TG
                      2026-08-04: *"so admin assiste replay de aluno. so do
                      tenant dele tbm."* That is STRICTER than the RLS, which
                      also admits the instructor (0034:274-281) and keeps doing
                      so for the ordinary result read. This `RequireRole
                      tenant_admin` is the route half of the gate; the
                      load-bearing half is in `replay.service.ts`, which issues
                      no query at all without an administered tenant and scopes
                      every read to that tenant's learners. */}
                  <Route
                    path="replay"
                    element={
                      <LazyPanel>
                        <ReplayPage />
                      </LazyPanel>
                    }
                  />
                  <Route
                    path="replay/:traceId"
                    element={
                      <LazyPanel>
                        <ReplaySessionPage />
                      </LazyPanel>
                    }
                  />
                  {/* The tenant owner's view of learner-produced work (ADR-9). */}
                  <Route
                    path="artifacts"
                    element={
                      <LazyPanel>
                        <AdminArtifactsPage />
                      </LazyPanel>
                    }
                  />
                </Route>

                {/* Author review+comment canvas + per-kind TEST (plan
                    20260706). Role-gated to `author` (authors AND instructors
                    qualify via itera.current_author_tenant_ids — RequireRole
                    checks the un-wired `author` role). ADR-5 reconciled: this
                    is activity CONTENT review/comment/test + a publish toggle,
                    NOT structure authoring (that stays in dfl-lms-admin) and NOT
                    a content editor (edits go via itera-mcp). */}
                <Route
                  path="/author"
                  element={
                    <RequireAuth>
                      <RequireRole role="author">
                        <LazyRoute>
                          <AuthorHomePage />
                        </LazyRoute>
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/author/units/:unitId/canvas"
                  element={
                    <RequireAuth>
                      <RequireRole role="author">
                        <LazyRoute>
                          <UnitCanvasPage />
                        </LazyRoute>
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/author/activities/:activityId/test"
                  element={
                    <RequireAuth>
                      <RequireRole role="author">
                        <LazyRoute>
                          <ActivityTestPage />
                        </LazyRoute>
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                {/* ADDITIVE (BYOC live wiring) — opt-in LIVE test route. Same
                    role gate as /test; mounts the live harness (real
                    responder+judge). Sibling of /test, not a replacement. */}
                <Route
                  path="/author/activities/:activityId/test-live"
                  element={
                    <RequireAuth>
                      <RequireRole role="author">
                        <LazyRoute>
                          <LiveActivityTestPage />
                        </LazyRoute>
                      </RequireRole>
                    </RequireAuth>
                  }
                />

                <Route path="/prototipo/cena" element={<LazyRoute><ScenePrototypePage /></LazyRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </IteraActivityHost>
          </TooltipProvider>
          </PersonalizationProvider>
        </QueryClientProvider>
      </AuthProvider>
    </I18nProvider>
  </ObservabilityProvider>
);

export default App;
