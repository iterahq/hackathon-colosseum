import type { ReactNode } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { PROFILE_NAME_MAX, type ProfileFormView, type ProfileIcon, type ProfileImage, type Translate } from '@iterahq/shell-core';
import { FOCUS_RING } from '../catalog/focusRing';
import { chosenProps, DISABLED_CURSOR, KEEP_FOCUS_ON_ENTER, MUTED_CONTROL_TEXT, PARAGRAPH, PLACEHOLDER_COLOR } from './slots/webSemantics';

export interface IdentityFormProps {
  t: Translate;
  form: ProfileFormView;
  icon: (icon: ProfileIcon) => ReactNode;
  image?: (image: ProfileImage) => ReactNode;
  onEditName: (name: string) => void;
  onPickPreset?: (url: string) => void;
  onRevert: () => void;
  onSave: () => void;
  /** Absent where the host has no file picker: the button is left out. */
  onUploadPhoto?: () => void;
  /** Absent when the account has no Learn photo. */
  onUseLearnPhoto?: () => void;
}

const LABEL = 'translate-y-[2px] font-mono text-xs uppercase leading-6 tracking-wider text-muted-foreground';
const PHOTO_BUTTON = `h-11 flex-row items-center gap-2 rounded-xl border border-border bg-background px-4 text-foreground hover:border-clay/60 ${FOCUS_RING}`;
const PHOTO_BUTTON_TEXT = 'font-sans text-sm text-foreground';

function Preview({ t, form, image }: Pick<IdentityFormProps, 't' | 'form' | 'image'>) {
  const label = form.name || 'avatar';
  return (
    <View className="flex-row items-center gap-4">
      {form.avatarUrl === '' ? (
        <View testID="profile-avatar-initials" className="h-20 w-20 items-center justify-center rounded-full border-2 border-evergreen/40 bg-evergreen-soft">
          <Text className="font-display text-2xl font-bold text-evergreen-hi">{form.initials}</Text>
        </View>
      ) : image ? (
        image({ kind: 'preview', uri: form.avatarUrl, label })
      ) : (
        <Image testID="profile-avatar-preview" aria-label={label} source={{ uri: form.avatarUrl }} resizeMode="cover" className="h-20 w-20 rounded-full border-2 border-evergreen/40" />
      )}
      <View className="min-w-0 shrink">
        <Text numberOfLines={1} className="font-display text-lg text-foreground">
          {form.name || t('profile.namePlaceholder')}
        </Text>
        <Text testID="profile-email" numberOfLines={1} className="font-sans text-sm text-muted-foreground">
          {form.email ?? ''}
        </Text>
      </View>
    </View>
  );
}

function Presets({ t, form, image, onPickPreset }: Pick<IdentityFormProps, 't' | 'form' | 'image' | 'onPickPreset'>) {
  return (
    <View>
      <Text className={LABEL}>{t('profile.avatarLabel')}</Text>
      <View className="mt-2">
        <View testID="profile-avatar-grid" className="-m-[5px] flex-row flex-wrap">
          {form.presets.map((url) => {
            const chosen = form.avatarUrl === url;
            return (
              <View key={url} className="w-1/4 p-[5px] sm:w-[12.5%]">
                <Pressable
                  role="button"
                  testID="profile-avatar-option"
                  {...chosenProps(chosen)}
                  onPress={() => onPickPreset?.(url)}
                  className={`aspect-square w-full overflow-hidden rounded-full border-2 ${FOCUS_RING} ${chosen ? 'border-clay ring-2 ring-clay/30' : 'border-border hover:border-clay/40'}`}
                >
                  {image ? image({ kind: 'preset', uri: url, label: '' }) : <Image source={{ uri: url }} resizeMode="cover" className="h-full w-full" />}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Photo({ t, form, icon, onUploadPhoto, onUseLearnPhoto }: Pick<IdentityFormProps, 't' | 'form' | 'icon' | 'onUploadPhoto' | 'onUseLearnPhoto'>) {
  return (
    <View>
      <Text className={LABEL}>{t('profile.photoLabel')}</Text>
      <View className="mt-2 flex-row flex-wrap gap-2.5">
        {onUploadPhoto && (
          <Pressable role="button" testID="profile-photo-upload" disabled={form.uploading} onPress={onUploadPhoto} className={`${PHOTO_BUTTON} ${form.uploading ? 'opacity-50' : ''}`}>
            {icon({ kind: 'upload' })}
            <Text className={PHOTO_BUTTON_TEXT}>{form.uploading ? t('profile.uploading') : t('profile.uploadCta')}</Text>
          </Pressable>
        )}
        {onUseLearnPhoto && (
          <Pressable role="button" testID="profile-use-learn-photo" onPress={onUseLearnPhoto} className={PHOTO_BUTTON}>
            {icon({ kind: 'learn-photo' })}
            <Text className={PHOTO_BUTTON_TEXT}>{t('profile.useLearnPhoto')}</Text>
          </Pressable>
        )}
      </View>
      {onUploadPhoto && <Text className="mt-1.5 font-sans text-xs text-muted-foreground">{t('profile.uploadHint')}</Text>}
      {form.uploadFailed && (
        <Text testID="profile-photo-error" className="mt-1.5 font-sans text-sm text-destructive">
          {t('profile.uploadError')}
        </Text>
      )}
    </View>
  );
}

/** The identity card: who the learner is to other learners. */
export function IdentityForm(props: IdentityFormProps) {
  const { t, form, icon, onEditName, onRevert, onSave, onUploadPhoto, onUseLearnPhoto } = props;
  return (
    <View testID="profile-form" className="mt-8 gap-6 rounded-3xl border border-border bg-card p-6 md:p-8">
      <Preview {...props} />

      <View>
        <Text className={LABEL}>{t('profile.nameLabel')}</Text>
        <TextInput
          testID="profile-name-input"
          aria-label={t('profile.nameLabel')}
          value={form.name}
          onChangeText={onEditName}
          onSubmitEditing={onSave}
          {...KEEP_FOCUS_ON_ENTER}
          maxLength={PROFILE_NAME_MAX}
          placeholder={t('profile.namePlaceholder')}
          placeholderTextColor={PLACEHOLDER_COLOR}
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 font-sans text-base leading-normal text-foreground outline-none focus:border-clay/60"
        />
      </View>

      {form.presets.length > 0 && <Presets {...props} />}
      {(onUploadPhoto || onUseLearnPhoto || form.uploadFailed) && <Photo {...props} />}

      {form.canRevert && (
        <Pressable role="button" testID="profile-revert" onPress={onRevert} className={`flex-row items-center gap-2 self-start text-muted-foreground hover:text-foreground ${FOCUS_RING}`}>
          {icon({ kind: 'revert' })}
          <Text className={`font-sans text-sm ${MUTED_CONTROL_TEXT}`}>{t('profile.revert')}</Text>
        </Pressable>
      )}

      {form.saveFailed && (
        <Text role={PARAGRAPH} testID="profile-save-error" className="font-sans text-sm text-destructive">
          {t('profile.saveError')}
        </Text>
      )}
      {form.saved && (
        <Text role={PARAGRAPH} testID="profile-saved" className="font-sans text-sm text-evergreen-hi">
          {t('profile.saved')}
        </Text>
      )}

      <Pressable
        role="button"
        testID="profile-save"
        disabled={!form.canSave}
        onPress={onSave}
        className={`h-12 w-full items-center justify-center rounded-full bg-evergreen hover:bg-evergreen-hi ${FOCUS_RING} ${form.canSave ? '' : `opacity-40 ${DISABLED_CURSOR}`}`}
      >
        <Text className="font-sans text-base font-medium text-obsidiana">{form.saving ? t('common.loading') : t('profile.save')}</Text>
      </Pressable>
    </View>
  );
}
