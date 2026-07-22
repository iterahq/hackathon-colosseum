/**
 * Client-side guard for avatar uploads. Mirrors the server-enforced limits on
 * the `avatars` storage bucket (2 MiB, image/* whitelist) so the user gets an
 * instant, friendly rejection instead of a storage 400. The bucket policy is
 * the authoritative check — this is UX, not security.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export type AvatarFileError = 'type' | 'size';

/** null = accepted; otherwise the reason it was rejected. */
export function validateAvatarFile(file: { type: string; size: number }): AvatarFileError | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > AVATAR_MAX_BYTES) return 'size';
  return null;
}

/** Storage-safe file extension for a validated avatar mime type (default png). */
export function avatarExtension(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'png';
}
