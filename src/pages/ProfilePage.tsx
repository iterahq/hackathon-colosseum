/**
 * /profile — self-profile page (urgent ask 2026-07-21): re-set photo (https
 * URL) or pick a bundled gamified icon + edit the display name. Data layer
 * pre-existed (profile.service + useProfile); this is the missing surface.
 * Auth-gated but NOT subscription-gated (identity stays editable without a
 * plan, like /subscribe). Logic in useProfileForm — page is render-only.
 */
import { motion } from 'framer-motion';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';
import { useProfileForm } from '@/hooks/useProfileForm';
import { ProfilePreview } from '@/components/profile/ProfilePreview';
import { ProfileAvatarPicker } from '@/components/profile/ProfileAvatarPicker';

export default function ProfilePage() {
  const { t } = useI18n();
  const f = useProfileForm();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="discover" />
      <main className="max-w-2xl mx-auto px-4 py-8 md:py-12" data-testid="profile-page">
        <h1 className="font-display text-3xl text-foreground">{t('profile.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1.5">{t('profile.subtitle')}</p>

        {f.query.isPending && (
          <p className="mt-8 text-muted-foreground" data-testid="profile-loading">
            {t('common.loading')}
          </p>
        )}

        {f.query.isError && (
          <div className="mt-8" data-testid="profile-error">
            <p className="text-destructive">{t('profile.loadError')}</p>
            <button
              type="button"
              onClick={() => f.query.refetch()}
              className="mt-3 px-4 h-10 rounded-full border border-border text-sm hover:border-clay/60 transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {!f.query.isPending && !f.query.isError && (
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-3xl border border-border bg-card p-6 md:p-8 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              f.save();
            }}
          >
            <ProfilePreview name={f.name} email={f.profile?.email ?? null} avatarUrl={f.avatarUrl} />

            <label className="block">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {t('profile.nameLabel')}
              </span>
              <input
                type="text"
                value={f.name}
                onChange={(e) => f.editName(e.target.value)}
                maxLength={40}
                data-testid="profile-name-input"
                placeholder={t('profile.namePlaceholder')}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-clay/60"
              />
            </label>

            <ProfileAvatarPicker
              avatarUrl={f.avatarUrl}
              photoUrl={f.photoUrl}
              photoInvalid={f.photoInvalid}
              onPickPreset={f.pickPreset}
              onPhotoUrl={f.editPhotoUrl}
            />

            {f.saveError && (
              <p className="text-sm text-destructive" data-testid="profile-save-error">
                {t('profile.saveError')}
              </p>
            )}
            {f.saved && !f.saving && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-evergreen-hi"
                data-testid="profile-saved"
              >
                {t('profile.saved')}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={!f.canSave}
              data-testid="profile-save"
              className="w-full h-12 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {f.saving ? t('common.loading') : t('profile.save')}
            </button>
          </motion.form>
        )}
      </main>
    </div>
  );
}
