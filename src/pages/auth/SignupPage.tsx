/**
 * Itera sign-up — self-serve registration has been removed.
 * This route now redirects to /login. Access requires a DFL membership or an
 * active Itera subscription — direct free registration is not offered.
 */
import { Navigate } from 'react-router-dom';

export default function SignupPage() {
  return <Navigate to="/login" replace />;
}
