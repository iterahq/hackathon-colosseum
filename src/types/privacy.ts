/** The learner's own privacy choices (`privacy` edge function) and the contact of a talent listing. */

export type ContactField = 'email' | 'telegram' | 'linkedin' | 'link';
export const CONTACT_FIELDS: readonly ContactField[] = ['email', 'telegram', 'linkedin', 'link'];

/** What the learner types to be listed. It leaves the browser in the request body and is kept nowhere else. */
export type ContactDraft = Record<ContactField, string>;
export const EMPTY_CONTACT: ContactDraft = { email: '', telegram: '', linkedin: '', link: '' };

/** A contact a company asked to see. It lives in the state of the card that asked, and only there. */
export type RevealedContact = Partial<Record<ContactField, string>>;

export interface CompanyAccess {
  isCompany: boolean;
  via: 'funded_bounty' | 'tenant_staff' | null;
  revealsLeftToday: number;
  revealsPerDay: number;
}

export interface Privacy {
  wallet: string | null;
  publicProfile: boolean;
  /** `chosen`: the learner decided. The other two: nobody decided yet (an account from before the switch stays visible, a new one starts private). */
  source: 'chosen' | 'existing_account' | 'new_account';
  talentListed: boolean;
  /** WHICH contacts the learner saved, never their values: the values are not kept in the app after they are sent. */
  contactKinds: ContactField[];
  companiesLooked: number;
  lastLookedAt: string | null;
  company: CompanyAccess;
}
