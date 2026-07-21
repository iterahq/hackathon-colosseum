import type { Locale } from '@/i18n';

/** The current user's editable Itera self-profile (itera.users own row). */
export interface MyProfile {
  displayName: string | null;
  avatarUrl: string | null;
  /** The fellow's DFL ("Learn") profile picture, refreshed server-side on every
   * federated login. NON-editable — the /profile "use my Learn photo" button
   * copies it into avatarUrl. Null for non-federated / photoless users. */
  dflAvatarUrl: string | null;
  email: string | null;
  /** The user's saved language preference (itera.users.locale). Default 'pt'. */
  locale: Locale | null;
}
