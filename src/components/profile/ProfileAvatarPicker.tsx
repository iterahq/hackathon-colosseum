import { useI18n } from '@/i18n';
import { PROFILE_AVATAR_PRESETS } from '@/consts/profileAvatars';

interface ProfileAvatarPickerProps {
  avatarUrl: string;
  photoUrl: string;
  photoInvalid: boolean;
  onPickPreset: (url: string) => void;
  onPhotoUrl: (value: string) => void;
}

/** Bundled gamified icon grid + optional https photo URL field. */
export function ProfileAvatarPicker({
  avatarUrl,
  photoUrl,
  photoInvalid,
  onPickPreset,
  onPhotoUrl,
}: ProfileAvatarPickerProps) {
  const { t } = useI18n();
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

      <label className="block">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {t('profile.photoLabel')}
        </span>
        <input
          type="url"
          value={photoUrl}
          onChange={(e) => onPhotoUrl(e.target.value)}
          data-testid="profile-photo-input"
          placeholder="https://…"
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-clay/60"
        />
        {photoInvalid && (
          <span className="mt-1.5 block text-sm text-destructive" data-testid="profile-photo-invalid">
            {t('profile.photoInvalid')}
          </span>
        )}
      </label>
    </>
  );
}
