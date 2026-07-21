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
import LessonPage from "./pages/LessonPage";
import LiveSessionPage from "./pages/LiveSessionPage";
import InstructorClassPage from "./pages/live/InstructorClassPage";
import NotFound from "./pages/NotFound";
import SubscribePage from "./pages/SubscribePage";
import ProfilePage from "./pages/ProfilePage";
import SubscribeReturnPage from "./pages/SubscribeReturnPage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import DflCallbackPage from "./pages/auth/DflCallbackPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import { RequireSubscription } from "./auth/RequireSubscription";
import AdminLayout from "./pages/admin/AdminLayout";
import RosterPage from "./pages/admin/RosterPage";
import CompletionPage from "./pages/admin/CompletionPage";
import EngagementPage from "./pages/admin/EngagementPage";
import AuthorHomePage from "./pages/author/AuthorHomePage";
import UnitCanvasPage from "./pages/author/UnitCanvasPage";
import ActivityTestPage from "./pages/author/ActivityTestPage";
// ADDITIVE (BYOC live wiring): opt-in sibling of the /test route that exercises
// the REAL responder+judge live path. Does not replace or alter /test.
import LiveActivityTestPage from "./pages/author/LiveActivityTestPage";
import { Navigate } from "react-router-dom";
import { I18nProvider } from "./i18n";
import { EmbedBridge } from "./auth/EmbedBridge";
import { LiveClassSignal } from "./components/branded";
import { useLocaleSync } from "./hooks/useLocaleSync";

const queryClient = new QueryClient();

/**
 * Side-effect-only component: hydrates the active locale from the user's saved
 * profile (itera.users.locale) on load and persists user-initiated language
 * changes back to the DB. Must live inside I18nProvider + AuthProvider +
 * QueryClientProvider (it reads the profile via React Query). Renders nothing.
 */
function LocaleSync() {
  useLocaleSync();
  return null;
}

const App = () => (
  <ObservabilityProvider>
    <I18nProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <LocaleSync />
            <BrowserRouter>
              <EmbedBridge />
              {/* App-wide "a class went live" signal — toasts on any route when a
                  live class starts (loop-2 fix #6). Enabled-tenant gating is
                  inherited from useActiveLiveClass. */}
              <LiveClassSignal />
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                {/* Self-serve registration — public (pre-auth), same level as
                    /login. The landing site points "Criar conta" here; a new
                    visitor signs up then lands on `from` (default "/"), the gate
                    routing them to /subscribe (FIX B, round-3 focus group). */}
                <Route path="/signup" element={<SignupPage />} />
                {/* Password recovery — /auth/forgot requests the email link
                    (public); /auth/reset is where the link lands (the recovery
                    token signs the user in via detectSessionInUrl). */}
                <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
                <Route path="/auth/reset" element={<ResetPasswordPage />} />
                {/* "Sign in with DFL" callback — exchanges the DFL token (from
                    the URL fragment) for an Itera session. Public (pre-auth). */}
                <Route path="/auth/dfl/callback" element={<DflCallbackPage />} />
                {/* Learner surfaces — RequireAuth → RequireSubscription. A
                    signed-in user with no active subscription is redirected to
                    /subscribe (tenant-admins/owners are exempt). PLG gate:
                    plan 20260624-itera-plg-subscribe-flow. */}
                <Route
                  path="/"
                  element={
                    <RequireAuth>
                      <RequireSubscription>
                        <HomePage />
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                {/* Self-serve catalog — browse + enroll into catalog courses
                    (round-1 finding #1). Subscription-gated like the other
                    learner surfaces: a paying user reaches the catalog and can
                    discover/enroll the flagship (itera-tenant) courses. */}
                <Route
                  path="/catalog"
                  element={
                    <RequireAuth>
                      <RequireSubscription>
                        <CatalogPage />
                      </RequireSubscription>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/program/:slug"
                  element={
                    <RequireAuth>
                      <RequireSubscription>
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
                    subscription-gated, else it'd be a redirect loop). */}
                <Route
                  path="/subscribe"
                  element={
                    <RequireAuth>
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
                {/* Student live-session surface — reuses the activity components in
                    session mode (server-authoritative pointer). Auth-gated only;
                    RLS + the in-app enable gate scope visibility. */}
                <Route
                  path="/live/:sessionId"
                  element={
                    <RequireAuth>
                      <LiveSessionPage />
                    </RequireAuth>
                  }
                />

                {/* Tenant-admin observability (plan #6) — role-gated, READ-ONLY,
                    single-tenant. NO authoring routes exist here by design
                    (authoring lives in dfl-lms-admin) — ADR-5. RequireAuth →
                    RequireRole: a learner hitting /admin is redirected to "/". */}
                <Route
                  path="/admin"
                  element={
                    <RequireAuth>
                      <RequireRole role="tenant_admin">
                        <AdminLayout />
                      </RequireRole>
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="roster" replace />} />
                  <Route path="roster" element={<RosterPage />} />
                  <Route path="programs" element={<CompletionPage />} />
                  <Route path="engagement" element={<EngagementPage />} />
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
                        <AuthorHomePage />
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/author/units/:unitId/canvas"
                  element={
                    <RequireAuth>
                      <RequireRole role="author">
                        <UnitCanvasPage />
                      </RequireRole>
                    </RequireAuth>
                  }
                />
                <Route
                  path="/author/activities/:activityId/test"
                  element={
                    <RequireAuth>
                      <RequireRole role="author">
                        <ActivityTestPage />
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
                        <LiveActivityTestPage />
                      </RequireRole>
                    </RequireAuth>
                  }
                />

                {/* Legacy gamified activity-engine demo (mock data) — kept for the
                    reusable activity components; not part of the canonical nav. */}
                <Route
                  path="/demo/lesson/:lessonId"
                  element={
                    <RequireAuth>
                      <LessonPage />
                    </RequireAuth>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </I18nProvider>
  </ObservabilityProvider>
);

export default App;
