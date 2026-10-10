import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import type { ProfileCertification, ProfileCompanion, ProfileMedal } from '@/types/learnerProfile';
import { tierLabel } from '@/utils/tier';

const CARD = 'rounded-[14px] border border-[#262320] bg-[#141210]';
const H2 = "[font:700_28px_'Barlow_Condensed']";
const LINK = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]';

export function CompanionSection({ companion }: { companion: ProfileCompanion }) {
  const { t } = useI18n();
  const art = companion.imageUrl;
  const facts = [
    companion.lives != null && `${t('passport.credential.lives')} ${companion.lives}/${companion.maxLives}`,
    companion.level != null && `${t('passport.credential.level')} ${companion.level}`,
    companion.xp != null && `${companion.xp} XP`,
    companion.streak != null && `${t('passport.credential.streak')} ${companion.streak}`,
    companion.outfit && t(`ux.outfit.${companion.outfit}`),
  ].filter(Boolean) as string[];
  return (
    <Link to={`/c/${companion.asset}`} className={`${CARD} flex w-full items-center gap-5 p-4 hover:border-[#3FD17F] ${LINK}`} data-testid="profile-companion">
      {art && <img src={art} alt="" width={120} height={120} className="h-[120px] w-[120px] flex-none rounded-xl border border-[#262320]" />}
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className={H2}>{t('profile.companion')}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 [font:500_13px_JetBrains_Mono] text-[#C9BFB0]">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </span>
        <span className="[font:500_12px_JetBrains_Mono] text-[#3FD17F]">{shortAddress(companion.asset)} →</span>
      </span>
    </Link>
  );
}

export function CertificationsSection({ items }: { items: ProfileCertification[] }) {
  const { t } = useI18n();
  if (items.length === 0) return <p className="[font:500_14px_Inter] text-[#A0978A]" data-testid="profile-no-certs">{t('profile.noCerts')}</p>;
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3" data-testid="profile-certs">
      {items.map((c) => {
        const art = c.imageUrl;
        return (
          <li key={c.asset}>
            <Link to={c.pageUrl?.startsWith('/c/') ? c.pageUrl : `/c/${c.asset}`} className={`flex flex-col gap-2 rounded-[14px] ${LINK}`} data-testid="profile-cert">
              {art && <img src={art} alt={`${c.trail}: ${c.daysDone}/${c.totalDays}`} loading="lazy" className="h-auto w-full rounded-2xl" />}
              <span className="[font:700_20px/1_'Barlow_Condensed']">{c.trail}</span>
              <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">
                {c.daysDone}/{c.totalDays}
                {c.tier && ` · ${tierLabel(t, c.tier)}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MedalsSection({ items }: { items: ProfileMedal[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-4" data-testid="profile-medals">
      {items.map((m) => {
        const art = m.imageUrl;
        return (
          <li key={m.asset}>
            <Link to={`/c/${m.asset}`} className={`flex w-[96px] flex-col items-center gap-1.5 text-center ${LINK}`} data-testid="profile-medal">
              {art ? <img src={art} alt="" loading="lazy" width={96} height={96} className="h-24 w-24" /> : <span className="h-24 w-24 rounded-xl border border-[#2E2A25]" />}
              <span className="[font:500_11px_JetBrains_Mono] text-[#C9BFB0]">{m.title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
