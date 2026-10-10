import { describe, expect, it } from 'vitest';
import { contactEmail } from '@/utils/contactEmail';

describe('contactEmail', () => {
  it('keeps a real address', () => {
    expect(contactEmail('ana@example.com')).toBe('ana@example.com');
  });

  it('hides the placeholder of a wallet sign-in', () => {
    expect(contactEmail('wallet-54d93c5c-e073-4c79-a5ff-28759aaaf618@wallets.hackathon.invalid')).toBeNull();
  });

  it('answers null when there is none', () => {
    expect(contactEmail(null)).toBeNull();
    expect(contactEmail(undefined)).toBeNull();
    expect(contactEmail('')).toBeNull();
  });
});
