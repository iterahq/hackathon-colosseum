import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTextDraft, readTextDraft, saveTextDraft } from './textDraft.service';
import { rememberStorageScope } from '@/utils/storageScope';

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope('learner-a');
});

describe('textDraft.service', () => {
  it('hands back the text that was saved for the activity', () => {
    saveTextDraft('act-1', 'what I understood so far');
    expect(readTextDraft('act-1')).toBe('what I understood so far');
    expect(readTextDraft('act-2')).toBeNull();
  });

  it('keeps one learner’s draft away from the next one on the same machine', () => {
    saveTextDraft('act-1', 'mine');
    rememberStorageScope('learner-b');
    expect(readTextDraft('act-1')).toBeNull();
  });

  it('forgets a cleared draft', () => {
    saveTextDraft('act-1', 'mine');
    clearTextDraft('act-1');
    expect(readTextDraft('act-1')).toBeNull();
  });

  it('reads garbage as no draft', () => {
    saveTextDraft('act-1', 'mine');
    const key = Object.keys(localStorage).find((k) => k.startsWith('itera.text.draft:'))!;
    localStorage.setItem(key, 'not json');
    expect(readTextDraft('act-1')).toBeNull();
  });

  describe('one live class does not hand its draft to another run of the activity', () => {
    afterEach(() => window.history.pushState({}, '', '/'));

    it('written in a live class, it is not read in the self-paced lesson nor in another class', () => {
      window.history.pushState({}, '', '/live/session-x');
      saveTextDraft('act-1', 'written in class X');
      expect(readTextDraft('act-1')).toBe('written in class X');

      window.history.pushState({}, '', '/lesson/l1');
      expect(readTextDraft('act-1')).toBeNull();
      window.history.pushState({}, '', '/live/session-y');
      expect(readTextDraft('act-1')).toBeNull();
    });
  });

  it('writes and reads nothing while nobody is known to be signed in', () => {
    localStorage.clear();
    saveTextDraft('act-1', 'whose?');
    expect(readTextDraft('act-1')).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('itera.text.draft'))).toEqual([]);
  });
});
