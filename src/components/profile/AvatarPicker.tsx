import { Link } from 'react-router-dom';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { useProfileAvatars } from '@/hooks/useProfileAvatars';
import { useI18n } from '@/i18n';

/** The profile picture section: free icons and owned NFT avatars only; tap to wear one. */
export function AvatarPicker() {
  const { t } = useI18n();
  const { options, current, equip } = useProfileAvatars();
  return (
    <section className="mt-6 rounded-3xl border border-[#262320] bg-[#141210] p-6 md:p-8" data-testid="avatar-picker">
      <h2 className="font-mono text-xs uppercase tracking-wider text-[#A0978A]">{t('avatar.picker.title')}</h2>
      <p className="mt-1 font-sans text-sm text-[#A0978A]">{t('avatar.picker.hint')}</p>
      <ul className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
        {options.map((a) => {
          const on = a.key === current.key;
          return (
            <li key={a.key}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={a.title}
                title={a.tierName && a.tierName !== a.title ? `${a.title} · ${a.tierName}` : a.title}
                data-testid="avatar-option"
                disabled={equip.isPending}
                onClick={() => !on && equip.mutate(a.key)}
                className={`flex w-full flex-col items-center gap-1 rounded-xl border p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F] ${on ? 'border-[#3FD17F]' : 'border-[#262320] hover:border-[#3FD17F]/50'}`}
              >
                <LearnerAvatar avatar={a} size="md" />
                <span className="max-w-full truncate font-mono text-[10px] text-[#C9BFB0]">{on ? t('avatar.picker.equipped') : a.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {equip.isError && (
        <p role="alert" className="mt-3 font-sans text-sm text-[#E07A4A]">
          {t('avatar.picker.error')}
        </p>
      )}
      <Link to="/shop" className="mt-4 inline-block font-mono text-sm text-[#3FD17F] underline-offset-4 hover:underline" data-testid="avatar-picker-shop">
        {t('avatar.picker.shop')}
      </Link>
    </section>
  );
}
