import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROFILE_DRAFT,
  profileDraftReducer,
  profileFormView,
  profileInitials,
  profileNameIsValid,
  type ProfileDraft,
  type ProfileDraftEvent,
  type ProfileFormFlags,
} from './profileDraft';

const run = (events: ProfileDraftEvent[], from: ProfileDraft = EMPTY_PROFILE_DRAFT) => events.reduce(profileDraftReducer, from);

const HYDRATE: ProfileDraftEvent = { type: 'hydrate', displayName: 'Ana', avatarUrl: 'https://photos.example/ana.png' };
const FLAGS: ProfileFormFlags = { email: 'ana@example.com', presets: [], saving: false, saveFailed: false, uploading: false, uploadFailed: false };

describe('profileDraftReducer', () => {
  it('takes the loaded profile once', () => {
    const draft = run([HYDRATE, { type: 'name', value: 'Ana C' }, { type: 'hydrate', displayName: 'Other', avatarUrl: null }]);
    expect(draft).toEqual({ hydrated: true, name: 'Ana C', avatarUrl: 'https://photos.example/ana.png', savedAvatarUrl: 'https://photos.example/ana.png', saved: false });
  });

  it('hydrates an account with no row as an empty form', () => {
    expect(run([{ type: 'hydrate', displayName: null, avatarUrl: null }])).toEqual({ ...EMPTY_PROFILE_DRAFT, hydrated: true });
  });

  it('reverts a picked avatar to the last saved one', () => {
    const picked = run([HYDRATE, { type: 'avatar', url: '/avatars/robo.svg' }]);
    expect(picked.avatarUrl).toBe('/avatars/robo.svg');
    expect(run([{ type: 'revert' }], picked).avatarUrl).toBe('https://photos.example/ana.png');
  });

  it('a save moves the revert target and an edit after it clears the saved mark', () => {
    const saved = run([HYDRATE, { type: 'avatar', url: '/avatars/robo.svg' }, { type: 'saved', avatarUrl: '/avatars/robo.svg' }]);
    expect(saved).toMatchObject({ saved: true, savedAvatarUrl: '/avatars/robo.svg' });
    expect(run([{ type: 'name', value: 'Ana Clara' }], saved).saved).toBe(false);
  });
});

describe('profileNameIsValid / profileInitials', () => {
  it('needs two characters besides spaces', () => {
    expect(profileNameIsValid(' a ')).toBe(false);
    expect(profileNameIsValid(' ab ')).toBe(true);
  });

  it('falls back from the name to the email to a fixed pair', () => {
    expect(profileInitials('ana', 'x@y.z')).toBe('AN');
    expect(profileInitials('', 'x@y.z')).toBe('X@');
    expect(profileInitials('', null)).toBe('IT');
  });
});

describe('profileFormView', () => {
  it('shapes the hydrated draft', () => {
    expect(profileFormView(run([HYDRATE]), FLAGS)).toEqual({
      name: 'Ana',
      email: 'ana@example.com',
      avatarUrl: 'https://photos.example/ana.png',
      initials: 'AN',
      presets: [],
      canSave: true,
      canRevert: false,
      saving: false,
      saved: false,
      saveFailed: false,
      uploading: false,
      uploadFailed: false,
    });
  });

  it('cannot save a short name, nor while saving or uploading', () => {
    expect(profileFormView(run([HYDRATE, { type: 'name', value: 'A' }]), FLAGS).canSave).toBe(false);
    expect(profileFormView(run([HYDRATE]), { ...FLAGS, saving: true }).canSave).toBe(false);
    expect(profileFormView(run([HYDRATE]), { ...FLAGS, uploading: true }).canSave).toBe(false);
  });

  it('offers the revert only for a hydrated draft whose avatar changed', () => {
    expect(profileFormView({ ...EMPTY_PROFILE_DRAFT, avatarUrl: 'x' }, FLAGS).canRevert).toBe(false);
    expect(profileFormView(run([HYDRATE, { type: 'avatar', url: 'x' }]), FLAGS).canRevert).toBe(true);
  });

  it('hides the saved mark while the next save runs', () => {
    const saved = run([HYDRATE, { type: 'saved', avatarUrl: 'https://photos.example/ana.png' }]);
    expect(profileFormView(saved, FLAGS).saved).toBe(true);
    expect(profileFormView(saved, { ...FLAGS, saving: true }).saved).toBe(false);
  });
});

describe('the 40-character limit of the name', () => {
  it('lives in the model: a longer name is cut as it is typed, whatever the field allowed', () => {
    const draft = run([HYDRATE, { type: 'name', value: 'y'.repeat(100_000) }]);
    expect(draft.name).toHaveLength(40);
  });

  it('a longer name that came from the backend is kept and can still be saved; editing it cuts it', () => {
    const long = 'Maria Antonieta das Neves Albuquerque e Silva Sauro';
    const draft = run([{ type: 'hydrate', displayName: long, avatarUrl: null }, { type: 'avatar', url: '/avatars/robo.svg' }]);
    expect(draft.name).toBe(long);
    expect(profileFormView(draft, FLAGS).canSave).toBe(true);
    expect(run([{ type: 'name', value: `${long}!` }], draft).name).toBe(long.slice(0, 40));
  });
});
