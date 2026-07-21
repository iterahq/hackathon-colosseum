import { useI18n } from '@/i18n';

interface ProfilePreviewProps {
  name: string;
  email: string | null;
  avatarUrl: string;
}

/** Live preview of the edited identity — photo/icon (or initials) + name + email. */
export function ProfilePreview({ name, email, avatarUrl }: ProfilePreviewProps) {
  const { t } = useI18n();
  const initials = (name || email || 'IT').slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-4">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || 'avatar'}
          referrerPolicy="no-referrer"
          className="w-20 h-20 rounded-full object-cover border-2 border-evergreen/40"
          data-testid="profile-avatar-preview"
        />
      ) : (
        <div
          className="w-20 h-20 rounded-full bg-evergreen-soft border-2 border-evergreen/40 text-evergreen-hi font-display font-bold flex items-center justify-center text-2xl"
          data-testid="profile-avatar-initials"
        >
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <div className="font-display text-lg text-foreground truncate">
          {name || t('profile.namePlaceholder')}
        </div>
        <div className="text-sm text-muted-foreground truncate" data-testid="profile-email">
          {email ?? ''}
        </div>
      </div>
    </div>
  );
}
