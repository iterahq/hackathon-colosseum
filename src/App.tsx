import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@devfellowship/components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ObservabilityProvider } from "@devfellowship/observability";
import HomePage from "./pages/HomePage";
import ProgramPage from "./pages/ProgramPage";
import LessonPlayer from "./pages/LessonPlayer";
import LessonPage from "./pages/LessonPage";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/auth/LoginPage";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireRole } from "./auth/RequireRole";
import AdminLayout from "./pages/admin/AdminLayout";
import RosterPage from "./pages/admin/RosterPage";
import CompletionPage from "./pages/admin/CompletionPage";
import EngagementPage from "./pages/admin/EngagementPage";
import { Navigate } from "react-router-dom";
import { I18nProvider } from "./i18n";
import { EmbedBridge } from "./auth/EmbedBridge";

const queryClient = new QueryClient();

const App = () => (
  <ObservabilityProvider>
    <I18nProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <EmbedBridge />
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/"
                  element={
                    <RequireAuth>
                      <HomePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/program/:slug"
                  element={
                    <RequireAuth>
                      <ProgramPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/lesson/:lessonId"
                  element={
                    <RequireAuth>
                      <LessonPlayer />
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
