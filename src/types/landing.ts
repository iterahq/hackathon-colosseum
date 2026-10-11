/** One person on the team, as the landing shows them. Every field is a fact the owner confirmed. */
export interface TeamMember {
  name: string;
  /** i18n key of the role line. */
  roleKey: string;
  /** i18n key of the one-paragraph bio. */
  bioKey: string;
}
