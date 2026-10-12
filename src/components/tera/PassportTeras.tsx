import { useLearnerProfile } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import { ProfileTeras } from './ProfileTeras';

/** On the learner's own certifications page: the Teras of the wallet with their origin, as the public profile shows them. Nothing without a wallet or an answer. */
export function PassportTeras({ wallet, headingClass }: { wallet: string | null; headingClass: string }) {
  const { locale } = useI18n();
  const query = useLearnerProfile(wallet ?? '', locale);
  const lookup = wallet ? query.data : undefined;
  if (lookup?.status !== 'ok') return null;
  return <ProfileTeras items={lookup.profile.avatars} headingClass={headingClass} />;
}
