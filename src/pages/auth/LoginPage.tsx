/**
 * Itera login — password sign-IN (the foundation gate) + DFL federated IdP button.
 * Thin wrapper around the shared AuthPage. The sign-IN behavior
 * (testids `login-page`/`login-form`/`submit-login`, "Bem-vindo de volta" heading,
 * `signInWithPassword` submit, navigate to `from`) is unchanged.
 */
import AuthPage from './AuthPage';

export default function LoginPage() {
  return <AuthPage />;
}
