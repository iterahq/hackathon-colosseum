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
import { I18nProvider } from "./i18n";

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
