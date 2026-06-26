/**
 * Itera login — password sign-IN (the foundation gate) + federated IdP buttons.
 * Thin wrapper around the shared AuthPage in 'signin' mode. The sign-IN behavior
 * (testids `login-page`/`login-form`/`submit-login`, "Bem-vindo de volta" heading,
 * `signInWithPassword` submit, navigate to `from`) is unchanged.
 */
import AuthPage from './AuthPage';

export default function LoginPage() {
  return <AuthPage mode="signin" />;
}
