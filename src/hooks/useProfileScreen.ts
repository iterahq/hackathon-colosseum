/**
 * Everything the universal profile screen takes from the web: the profile query, the draft of the form,
 * the three ways to set the avatar (a bundled icon, an uploaded photo, the Learn photo), the cast of the
 * exercises, and the legal and help links. The screen draws; this decides. componente → hook → service.
 */
import { useEffect, useReducer, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { EMPTY_PROFILE_DRAFT, legalHelpLinks, profileDraftReducer, profileFormView } from '@iterahq/shell-core';
import type { ProfileScreenProps } from '@iterahq/screens/profile';
import { PROFILE_AVATAR_PRESETS } from '@/consts/profileAvatars';
import { useProfile } from '@/hooks/useProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useUploadAvatar } from '@/hooks/useUploadAvatar';
import { useI18n } from '@/i18n';
import { formStateOf, personalizationDraftWith, personalizationViewOf } from '@/lib/profileScreenModel';
import { usePersonalization } from '@/personalization/personalizationPort';

const LEGAL_HELP = legalHelpLinks();

export interface ProfilePhotoInput {
  ref: RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function useProfileScreen(): { screen: Omit<ProfileScreenProps, 'header' | 'webOnly' | 'icon' | 'image'>; photoInput: ProfilePhotoInput } {
  const { t } = useI18n();
  const query = useProfile();
  const update = useUpdateProfile();
  const upload = useUploadAvatar();
  const cast = usePersonalization();
  const { data: profile, isPending } = query;

  const [draft, dispatch] = useReducer(profileDraftReducer, EMPTY_PROFILE_DRAFT);
  useEffect(() => {
    if (!isPending) dispatch({ type: 'hydrate', displayName: profile?.displayName ?? null, avatarUrl: profile?.avatarUrl ?? null });
  }, [isPending, profile]);

  const [castDraft, setCastDraft] = useState(cast.values);
  const [castSaving, setCastSaving] = useState(false);
  const [castSaved, setCastSaved] = useState(false);
  useEffect(() => setCastDraft(cast.values), [cast.values]);

  const fileRef = useRef<HTMLInputElement>(null);
  const form = profileFormView(draft, {
    email: profile?.email ?? null,
    presets: PROFILE_AVATAR_PRESETS,
    saving: update.isPending,
    saveFailed: update.isError,
    uploading: upload.isPending,
    uploadFailed: upload.isError,
  });
  const dflAvatarUrl = profile?.dflAvatarUrl ?? null;

  const onSave = () => {
    if (!form.canSave) return;
    const avatarUrl = draft.avatarUrl;
    update.mutate({ displayName: draft.name.trim(), avatarUrl }, { onSuccess: () => dispatch({ type: 'saved', avatarUrl }) });
  };

  const onSavePersonalization = async () => {
    setCastSaving(true);
    await cast.save(castDraft);
    setCastSaving(false);
    setCastSaved(true);
  };

  return {
    screen: {
      t,
      state: formStateOf(query, form),
      onRetry: () => void query.refetch(),
      onEditName: (value) => dispatch({ type: 'name', value }),
      onPickPreset: (url) => dispatch({ type: 'avatar', url }),
      onRevert: () => dispatch({ type: 'revert' }),
      onSave,
      onUploadPhoto: () => fileRef.current?.click(),
      onUseLearnPhoto: dflAvatarUrl ? () => dispatch({ type: 'avatar', url: dflAvatarUrl }) : undefined,
      personalization: personalizationViewOf(castDraft, { ready: cast.ready, saving: castSaving, saved: castSaved }, t),
      onChangePersonalization: (fieldId, text) => {
        setCastSaved(false);
        setCastDraft((d) => personalizationDraftWith(d, fieldId, text));
      },
      onSavePersonalization: () => void onSavePersonalization(),
      legalHelp: LEGAL_HELP,
    },
    photoInput: {
      ref: fileRef,
      onChange: (event) => {
        const file = event.target.files?.[0];
        if (file) upload.mutate(file, { onSuccess: (url) => dispatch({ type: 'avatar', url }) });
        event.target.value = '';
      },
    },
  };
}
