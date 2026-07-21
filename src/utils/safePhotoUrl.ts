/** Only https image URLs are accepted as a profile photo (blocks javascript:,
 * data:, http:// mixed content — the value lands in an <img src> for everyone
 * who sees the roster). */
export const isSafePhotoUrl = (v: string): boolean => /^https:\/\/.+/i.test(v.trim());
