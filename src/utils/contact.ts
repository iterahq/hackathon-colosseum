/** The contact of a talent listing, on the form side: the same rule the server applies, so the learner sees why a field is refused. The server stays the judge. */
import { CONTACT_FIELDS, type ContactDraft, type ContactField } from '@/types/privacy';

export const CONTACT_MAX: Record<ContactField, number> = { email: 120, telegram: 33, linkedin: 120, link: 200 };

/** Markup, quotes, spaces and control characters refuse any field. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\s<>"'`\\\u0000-\u001f\u007f]/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TELEGRAM = /^[a-z0-9_]{5,32}$/i;
const LINKEDIN = /^https:\/\/www\.linkedin\.com\/in\/[^/?#\s]+\/?$/;

function validLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** The value as it is sent: trimmed, and a Telegram handle without its leading @. */
export const tidyContact = (field: ContactField, value: string): string => {
  const trimmed = value.trim();
  return field === 'telegram' ? trimmed.replace(/^@/, '') : trimmed;
};

export function contactFieldValid(field: ContactField, raw: string): boolean {
  const value = tidyContact(field, raw);
  if (value === '') return true;
  if (value.length > CONTACT_MAX[field] || UNSAFE.test(value)) return false;
  if (field === 'email') return EMAIL.test(value);
  if (field === 'telegram') return TELEGRAM.test(value);
  if (field === 'linkedin') return LINKEDIN.test(value);
  return validLink(value);
}

export interface ContactCheck {
  /** Fields that hold something the server would refuse. */
  invalid: ContactField[];
  /** Nothing was typed in any field: a listing needs at least one way to be reached. */
  empty: boolean;
  /** What goes in the request: only the fields that were filled. */
  payload: Partial<Record<ContactField, string>>;
}

export function checkContact(draft: ContactDraft): ContactCheck {
  const payload: Partial<Record<ContactField, string>> = {};
  const invalid: ContactField[] = [];
  for (const field of CONTACT_FIELDS) {
    const value = tidyContact(field, draft[field]);
    if (value === '') continue;
    if (contactFieldValid(field, value)) payload[field] = value;
    else invalid.push(field);
  }
  return { invalid, empty: Object.keys(payload).length === 0 && invalid.length === 0, payload };
}
