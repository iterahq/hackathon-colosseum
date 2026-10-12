import { Link } from 'react-router-dom';
import { FOCUS_EARN_STORY_OFF } from '@/config/focus';
import { useI18n } from '@/i18n';

/** What a stranger gets on the profile page of a learner who keeps it private: one calm line, and nothing we aggregate. */
export function PrivateProfile({ preview = false }: { preview?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-col gap-2 rounded-[14px] border border-[#262320] bg-[#141210] ${preview ? 'p-3' : 'p-5'}`} data-testid={preview ? 'profile-private-preview' : 'profile-private'}>
      <p className={`text-[#F4EDE2] ${preview ? '[font:700_18px/1.2_\'Barlow_Condensed\']' : '[font:700_28px/1.1_\'Barlow_Condensed\']'}`}>{t('privacy.private.title')}</p>
      <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('privacy.private.body')}</p>
      {!preview && !FOCUS_EARN_STORY_OFF && (
        <Link to="/verify" className="inline-flex min-h-11 items-center self-start [font:600_13px_JetBrains_Mono] text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          {t('privacy.private.verify')} →
        </Link>
      )}
    </div>
  );
}
