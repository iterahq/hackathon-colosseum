import type { ProfileFormView } from '../ports/profile';

export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 40;

/** What the learner is editing. `savedAvatarUrl` is the last SAVED avatar, the target of "revert". */
export interface ProfileDraft {
  readonly hydrated: boolean;
  readonly name: string;
  readonly avatarUrl: string;
  readonly savedAvatarUrl: string;
  readonly saved: boolean;
}

export const EMPTY_PROFILE_DRAFT: ProfileDraft = { hydrated: false, name: '', avatarUrl: '', savedAvatarUrl: '', saved: false };

export type ProfileDraftEvent =
  /** The loaded profile, taken once: a later refetch never overwrites what is being typed. */
  | { readonly type: 'hydrate'; readonly displayName: string | null; readonly avatarUrl: string | null }
  | { readonly type: 'name'; readonly value: string }
  | { readonly type: 'avatar'; readonly url: string }
  | { readonly type: 'revert' }
  | { readonly type: 'saved'; readonly avatarUrl: string };

export function profileDraftReducer(draft: ProfileDraft, event: ProfileDraftEvent): ProfileDraft {
  switch (event.type) {
    case 'hydrate': {
      if (draft.hydrated) return draft;
      const avatarUrl = event.avatarUrl ?? '';
      return { hydrated: true, name: event.displayName ?? '', avatarUrl, savedAvatarUrl: avatarUrl, saved: false };
    }
    // The limit of a name lives here, whatever the field allowed. A longer name that came from the backend (the DFL name) is
    // kept as it is until the learner edits it: cutting it on a save of the avatar would change what nobody touched.
    case 'name':
      return { ...draft, name: event.value.slice(0, PROFILE_NAME_MAX), saved: false };
    case 'avatar':
      return { ...draft, avatarUrl: event.url, saved: false };
    case 'revert':
      return { ...draft, avatarUrl: draft.savedAvatarUrl, saved: false };
    case 'saved':
      return { ...draft, savedAvatarUrl: event.avatarUrl, saved: true };
  }
}

/** At least two characters, spaces at the ends aside. The upper limit is applied where a name is typed (the `name` event). */
export const profileNameIsValid = (name: string): boolean => name.trim().length >= PROFILE_NAME_MIN;

/** Two letters for the avatar circle when there is no picture. */
export const profileInitials = (name: string, email: string | null): string => (name || email || 'IT').slice(0, 2).toUpperCase();

export interface ProfileFormFlags {
  readonly email: string | null;
  readonly presets: readonly string[];
  readonly saving: boolean;
  readonly saveFailed: boolean;
  readonly uploading: boolean;
  readonly uploadFailed: boolean;
}

/** The form as the screen draws it. */
export function profileFormView(draft: ProfileDraft, flags: ProfileFormFlags): ProfileFormView {
  return {
    name: draft.name,
    email: flags.email,
    avatarUrl: draft.avatarUrl,
    initials: profileInitials(draft.name, flags.email),
    presets: flags.presets,
    canSave: profileNameIsValid(draft.name) && !flags.saving && !flags.uploading,
    canRevert: draft.hydrated && draft.avatarUrl !== draft.savedAvatarUrl,
    saving: flags.saving,
    saved: draft.saved && !flags.saving,
    saveFailed: flags.saveFailed,
    uploading: flags.uploading,
    uploadFailed: flags.uploadFailed,
  };
}
