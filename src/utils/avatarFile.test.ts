import { describe, it, expect } from 'vitest';
import {
  validateAvatarFile,
  avatarExtension,
  AVATAR_MAX_BYTES,
} from './avatarFile';

describe('validateAvatarFile', () => {
  it('accepts a png under the size limit', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1024 })).toBeNull();
  });

  it('rejects a non-image mime type', () => {
    expect(validateAvatarFile({ type: 'application/pdf', size: 10 })).toBe('type');
  });

  it('rejects an oversized file', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES + 1 })).toBe('size');
  });

  it('accepts a file exactly at the size limit', () => {
    expect(validateAvatarFile({ type: 'image/webp', size: AVATAR_MAX_BYTES })).toBeNull();
  });
});

describe('avatarExtension', () => {
  it('maps known mime types to a storage-safe extension', () => {
    expect(avatarExtension('image/jpeg')).toBe('jpg');
    expect(avatarExtension('image/png')).toBe('png');
    expect(avatarExtension('image/webp')).toBe('webp');
    expect(avatarExtension('image/gif')).toBe('gif');
  });

  it('falls back to png for an unknown mime type', () => {
    expect(avatarExtension('image/tiff')).toBe('png');
  });
});
