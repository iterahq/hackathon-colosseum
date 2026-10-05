import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityStoragePort } from '../ports.js';
import {
  MEDIA_HOVER_PREFERENCE_KEY,
  readMediaHoverPreference,
  resetMediaHoverPreference,
  subscribeMediaHoverPreference,
  writeMediaHoverPreference,
} from './mediaHoverPreference.js';

function memoryStorage(initial: Record<string, string> = {}): ActivityStoragePort & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    read: (key) => data[key] ?? null,
    write: (key, value) => {
      data[key] = value;
    },
    clear: (key) => {
      delete data[key];
    },
  };
}

beforeEach(() => resetMediaHoverPreference());

describe('media hover preference', () => {
  it('is on until the learner turns it off', () => {
    expect(readMediaHoverPreference(memoryStorage())).toBe(true);
    resetMediaHoverPreference();
    expect(readMediaHoverPreference(memoryStorage({ [MEDIA_HOVER_PREFERENCE_KEY]: 'off' }))).toBe(false);
  });

  it('persists "off" and clears the key when turned back on', () => {
    const storage = memoryStorage();
    writeMediaHoverPreference(storage, false);
    expect(storage.data[MEDIA_HOVER_PREFERENCE_KEY]).toBe('off');
    expect(readMediaHoverPreference(storage)).toBe(false);
    writeMediaHoverPreference(storage, true);
    expect(storage.data[MEDIA_HOVER_PREFERENCE_KEY]).toBeUndefined();
    expect(readMediaHoverPreference(storage)).toBe(true);
  });

  it('tells every subscriber when one toggle flips', () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeMediaHoverPreference(a);
    const stopB = subscribeMediaHoverPreference(b);
    writeMediaHoverPreference(memoryStorage(), false);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    writeMediaHoverPreference(memoryStorage(), true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    stopB();
  });

  it('keeps working on a storage that throws', () => {
    const broken: ActivityStoragePort = {
      read: () => {
        throw new Error('quota');
      },
      write: () => {
        throw new Error('quota');
      },
      clear: () => {
        throw new Error('quota');
      },
    };
    expect(readMediaHoverPreference(broken)).toBe(true);
    expect(() => writeMediaHoverPreference(broken, false)).not.toThrow();
    expect(readMediaHoverPreference(broken)).toBe(false);
  });
});
