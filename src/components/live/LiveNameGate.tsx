import { motion } from 'framer-motion';
import { useI18n } from '@/i18n';
import { useLiveNameGate } from '@/hooks/useLiveNameGate';
import { LIVE_AVATAR_PRESETS } from '@/consts/liveAvatars';

interface LiveNameGateProps {
  initialName?: string;
  initialAvatarUrl?: string | null;
  onDone: () => void;
}

/**
 * Pre-class step (after joining the room, before the activity) shown only when
 * the learner has no real name yet: pick a name + an avatar from the presets,
 * persisted as the Itera profile override. No photo upload.
 */
export function LiveNameGate({ initialName, initialAvatarUrl, onDone }: LiveNameGateProps) {
  const { t } = useI18n();
  const { name, setName, avatarUrl, setAvatarUrl, saving, error, canSubmit, submit } =
    useLiveNameGate({ initialName, initialAvatarUrl, onDone });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 max-w-md mx-auto rounded-3xl border border-border bg-card p-6 md:p-8"
      data-testid="live-name-gate"
    >
      <h2 className="font-display text-2xl text-foreground text-center">{t('live.nameGate.title')}</h2>
      <p className="text-sm text-muted-foreground mt-1.5 text-center">{t('live.nameGate.subtitle')}</p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {t('live.nameGate.nameLabel')}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoFocus
            data-testid="live-name-input"
            placeholder={t('live.nameGate.namePlaceholder')}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-clay/60"
          />
        </label>

        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {t('live.nameGate.avatarLabel')}
          </span>
          <div className="mt-2 grid grid-cols-6 gap-2.5" data-testid="live-avatar-grid">
            {LIVE_AVATAR_PRESETS.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => setAvatarUrl(url)}
                data-testid="live-avatar-option"
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

        {error && (
          <p className="text-sm text-destructive text-center" data-testid="live-name-gate-error">
            {t('live.nameGate.error')}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="live-name-gate-submit"
          className="w-full h-12 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? t('common.loading') : t('live.nameGate.submit')}
        </button>
      </form>
    </motion.div>
  );
}
