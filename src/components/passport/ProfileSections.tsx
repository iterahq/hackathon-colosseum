import { Link } from 'react-router-dom';
import { ArtZoom } from '@/components/artviewer';
import { LivesHearts } from '@/components/lives/LivesHearts';
import { useI18n } from '@/i18n';
import { addressUrl, shortAddress } from '@/lib/explorer';
import type { ProfileCertification, ProfileCompanion, ProfileMedal } from '@/types/learnerProfile';
import { tierLabel } from '@/utils/tier';
import { SnapshotLine } from './SnapshotLine';

const CARD = 'rounded-[14px] border border-[#262320] bg-[#141210]';
const LINK = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]';
const MONO = '[font:500_13px_JetBrains_Mono]';

export function CompanionSection({ companion }: { companion: ProfileCompanion }) {
  const { t } = useI18n();
  const facts = [
    companion.level != null && `${t('passport.credential.level')} ${companion.level}`,
    companion.streak != null && `${t('passport.credential.streak')} ${companion.streak}`,
    companion.xp != null && `${companion.xp} XP`,
    companion.outfit && t(`ux.outfit.${companion.outfit}`),
  ].filter(Boolean) as string[];
  return (
    <Link to={`/c/${companion.asset}`} className={`${CARD} flex w-full items-center gap-4 p-4 hover:border-[#3FD17F] sm:gap-6 sm:p-5 ${LINK}`} data-testid="profile-companion">
      {companion.imageUrl && <img src={companion.imageUrl} alt="" width={160} height={160} className="h-[104px] w-[104px] flex-none rounded-xl border border-[#262320] sm:h-[160px] sm:w-[160px]" />}
      <span className="flex min-w-0 flex-col gap-2">
        <span className="[font:700_28px/1_'Barlow_Condensed']">{t('profile.companion')}</span>
        {companion.lives != null && <LivesHearts current={companion.lives} max={companion.maxLives} size={18} label={`${t('passport.credential.lives')} ${companion.lives}/${companion.maxLives}`} className="gap-1" />}
        <span className={`flex flex-wrap gap-x-3 gap-y-1 ${MONO} text-[#C9BFB0]`}>
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </span>
        <SnapshotLine mirroredAt={companion.mirroredAt} />
        <span className="[font:500_12px_JetBrains_Mono] text-[#3FD17F]">{shortAddress(companion.asset)} →</span>
      </span>
    </Link>
  );
}

export function NoCompanion() {
  const { t } = useI18n();
  return (
    <p className={`${CARD} px-5 py-4 [font:500_14px_Inter] text-[#A0978A]`} data-testid="profile-no-companion">
      {t('profile.noCompanion')}
    </p>
  );
}

export function CertificationsSection({ items }: { items: ProfileCertification[] }) {
  const { t } = useI18n();
  if (items.length === 0) return <p className="[font:500_14px_Inter] text-[#A0978A]" data-testid="profile-no-certs">{t('profile.noCerts')}</p>;
  return (
    <ul className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))]" data-testid="profile-certs">
      {items.map((c) => (
        <li key={c.asset} className="relative">
          {c.imageUrl && <ArtZoom title={c.trail} line={t('viewer.cert.line', { done: c.daysDone, total: c.totalDays })} src={c.imageUrl} asset={c.asset} aspect={3 / 4} className="absolute right-5 top-5 z-10" />}
          <Link to={c.pageUrl?.startsWith('/c/') ? c.pageUrl : `/c/${c.asset}`} className={`${CARD} flex h-full flex-col gap-3 p-3 hover:border-[#3FD17F] ${LINK}`} data-testid="profile-cert">
            {c.imageUrl && <img src={c.imageUrl} alt={`${c.trail}: ${c.daysDone}/${c.totalDays}`} loading="lazy" className="h-auto w-full rounded-xl" />}
            <span className="flex flex-col gap-1 px-1 pb-1">
              <span className="[font:700_22px/1_'Barlow_Condensed']">{c.trail}</span>
              <span className="flex flex-wrap items-center gap-x-2 [font:500_12px_JetBrains_Mono] text-[#A0978A]">
                <span>{t('profile.days', { done: c.daysDone, total: c.totalDays })}</span>
                {c.tier && <span className="rounded-full border border-[#2E2A25] px-2 py-0.5 uppercase tracking-[.06em] text-[#C9BFB0]">{tierLabel(t, c.tier)}</span>}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MedalsSection({ items }: { items: ProfileMedal[] }) {
  if (items.length === 0) return null;
  return (
    <ul className={`${CARD} flex flex-wrap gap-x-5 gap-y-4 px-4 py-5`} data-testid="profile-medals">
      {items.map((m) => (
        <li key={m.asset}>
          <Link to={`/c/${m.asset}`} className={`flex w-[104px] flex-col items-center gap-2 rounded-lg text-center ${LINK}`} data-testid="profile-medal">
            {m.imageUrl ? <img src={m.imageUrl} alt="" loading="lazy" width={96} height={96} className="h-24 w-24" /> : <span className="h-24 w-24 rounded-xl border border-[#2E2A25]" />}
            <span className="[font:500_11px/1.3_JetBrains_Mono] text-[#C9BFB0]">{m.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ExplorerLink({ address }: { address: string }) {
  const { t } = useI18n();
  return (
    <a href={addressUrl(address)} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center rounded ${MONO} text-[#3FD17F] hover:underline ${LINK}`}>
      {t('profile.explorer')} ↗
    </a>
  );
}
