export type NewPasswordIssue = 'weak' | 'mismatch' | null;

export function validateNewPassword(password: string, confirm: string): NewPasswordIssue {
  if (password.length < 8) return 'weak';
  if (password !== confirm) return 'mismatch';
  return null;
}
