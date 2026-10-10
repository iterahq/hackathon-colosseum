/**
 * Everything the universal profile screen takes from the web: the profile query, the draft of the form,
 * the cast of the
 * exercises, and the legal and help links. The screen draws; this decides. componente → hook → service.
 */
import { useEffect, useReducer, useState } from 'react';
import { EMPTY_PROFILE_DRAFT, legalHelpLinks, profileDraftReducer, profileFormView } from '@iterahq/shell-core';
import type { ProfileScreenProps } from '@iterahq/screens/profile';
import { useProfile } from '@/hooks/useProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useLearnerAvatar } from '@/hooks/useLearnerAvatar';
import { useI18n } from '@/i18n';
import { formStateOf, personalizationDraftWith, personalizationViewOf } from '@/lib/profileScreenModel';
import { usePersonalization } from '@/personalization/personalizationPort';

const LEGAL_HELP = legalHelpLinks();

type ScreenState = ProfileScreenProps['state'];
/** The identity card previews the picture the learner wears now; the photo column is no longer edited here. */
const shownWith = (state: ScreenState, imageUrl: string): ScreenState =>
  state.kind === 'ready' ? { ...state, form: { ...state.form, avatarUrl: imageUrl } } : state;

export function useProfileScreen(): { screen: Omit<ProfileScreenProps, 'header' | 'webOnly' | 'icon' | 'image'> } {
  const { t } = useI18n();
  const query = useProfile();
  const update = useUpdateProfile();
  const avatar = useLearnerAvatar();
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

  const form = profileFormView(draft, {
    email: profile?.email ?? null,
    presets: [],
    saving: update.isPending,
    saveFailed: update.isError,
    uploading: false,
    uploadFailed: false,
  });

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
      state: shownWith(formStateOf(query, form), avatar.imageUrl),
      onRetry: () => void query.refetch(),
      onEditName: (value) => dispatch({ type: 'name', value }),
      onRevert: () => dispatch({ type: 'revert' }),
      onSave,
      personalization: personalizationViewOf(castDraft, { ready: cast.ready, saving: castSaving, saved: castSaved }, t),
      onChangePersonalization: (fieldId, text) => {
        setCastSaved(false);
        setCastDraft((d) => personalizationDraftWith(d, fieldId, text));
      },
      onSavePersonalization: () => void onSavePersonalization(),
      legalHelp: LEGAL_HELP,
    },
  };
}
