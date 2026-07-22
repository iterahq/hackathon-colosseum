import { useRef } from 'react';
import { Upload, GraduationCap } from 'lucide-react';
import { useI18n } from '@/i18n';
import { PROFILE_AVATAR_PRESETS } from '@/consts/profileAvatars';
import { AVATAR_MIME_TYPES } from '@/utils/avatarFile';

interface ProfileAvatarPickerProps {
  avatarUrl: string;
  dflAvatarUrl: string | null;
  uploading: boolean;
  uploadError: boolean;
  onPickPreset: (url: string) => void;
  onUploadFile: (file: File) => void;
  onUseLearnPhoto: () => void;
}

/** Bundled gamified icon grid + photo upload + "use my Learn photo" shortcut. */
export function ProfileAvatarPicker({
  avatarUrl,
  dflAvatarUrl,
  uploading,
  uploadError,
  onPickPreset,
  onUploadFile,
  onUseLearnPhoto,
}: ProfileAvatarPickerProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div>
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {t('profile.avatarLabel')}
        </span>
        <div className="mt-2 grid grid-cols-4 sm:grid-cols-8 gap-2.5" data-testid="profile-avatar-grid">
          {PROFILE_AVATAR_PRESETS.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => onPickPreset(url)}
              data-testid="profile-avatar-option"
              data-selected={avatarUrl === url ? 'true' : undefined}
              aria-pressed={avatarUrl === url}
              className={`aspect-square rounded-full border-2 overflow-hidden transition ${
                avatarUrl === url ? 'border-clay ring-2 ring-clay/30' : 'border-border hover:border-clay/40'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {t('profile.photoLabel')}
        </span>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_MIME_TYPES.join(',')}
            className="hidden"
            data-testid="profile-photo-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="profile-photo-upload"
            className="inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-border bg-background text-sm text-foreground hover:border-clay/60 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? t('profile.uploading') : t('profile.uploadCta')}
          </button>

          {dflAvatarUrl && (
            <button
              type="button"
              onClick={onUseLearnPhoto}
              data-testid="profile-use-learn-photo"
              className="inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-border bg-background text-sm text-foreground hover:border-clay/60 transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              {t('profile.useLearnPhoto')}
            </button>
          )}
        </div>
        <span className="mt-1.5 block text-xs text-muted-foreground">{t('profile.uploadHint')}</span>
        {uploadError && (
          <span className="mt-1.5 block text-sm text-destructive" data-testid="profile-photo-error">
            {t('profile.uploadError')}
          </span>
        )}
      </div>
    </>
  );
}
