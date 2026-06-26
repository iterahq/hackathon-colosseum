/**
 * Itera sign-up — self-serve password registration (FIX B, round-3 focus group).
 * Thin wrapper around the shared AuthPage in 'signup' mode. Submitting calls
 * AuthContext.signUpWithPassword and, on success, navigates to the `from`
 * location (default '/') — so the landing-site "Criar conta" → /signup → (gated
 * route, e.g. /subscribe) flow works for a brand-new self-serve visitor.
 */
import AuthPage from './AuthPage';

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
