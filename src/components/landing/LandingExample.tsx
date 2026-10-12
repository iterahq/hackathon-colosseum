import { Link } from 'react-router-dom';
import { FOCUS, LABEL, PANEL } from '@/components/world/worldStyles';
import { useLearnerProfile } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { EXAMPLE_WALLET, KNOWN_TIERS } from './landingStyles';

/** One real public profile, read live: certification, verified capabilities and medals. Hidden when the read fails. */
export function LandingExample() {
  const { t, locale } = useI18n();
  const example = useLearnerProfile(EXAMPLE_WALLET, locale);
  if (example.isPending) return <div className={`${PANEL} h-[132px] animate-pulse`} aria-hidden data-testid="landing-example-loading" />;
  const profile = example.data?.status === 'ok' ? example.data.profile : null;
  if (!profile) return null;
  const cert = profile.certifications[0] ?? null;
  const caps = profile.capabilities;
  const tier = cert?.tier && KNOWN_TIERS.has(cert.tier) ? t(`landing.tier.${cert.tier}`) : (cert?.tier ?? '');
  const verified = Boolean(cert?.verified);
  return (
    <Link
      to={`/u/${EXAMPLE_WALLET}`}
      className={`${PANEL} flex flex-col gap-4 p-5 hover:border-[#3FD17F] sm:flex-row sm:items-center ${FOCUS}`}
      data-testid="landing-example"
    >
      <img src={profile.avatar.imageUrl} alt="" draggable={false} className="h-16 w-16 shrink-0 rounded-full bg-[#0A0908] object-cover ring-2 ring-[#3FD17F]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={`${LABEL} text-[#A0978A]`}>
          {t('landing.example.label')} · <span className="normal-case tracking-normal" data-testid="landing-example-wallet">{shortAddress(profile.wallet)}</span>
        </span>
        {cert && (
          <span className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">
            {t('landing.example.cert', { trail: cert.trail, days: cert.daysDone, total: cert.totalDays, tier })}
          </span>
        )}
        <span className="[font:500_13px_JetBrains_Mono] text-[#C9BFB0]">
          {caps ? t('landing.example.claims', { n: caps.verifiedCount, total: caps.total }) : null}
        </span>
      </div>
      <span className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className={`rounded-full px-3 py-1 [font:600_11px_JetBrains_Mono] uppercase tracking-[.1em] ${verified ? 'bg-[#1F8A4F]/30 text-[#5BE095]' : 'bg-[#2E2A25] text-[#A0978A]'}`}>
          {verified ? t('landing.example.verified') : t('landing.example.unverified')}
        </span>
        <span className="[font:600_14px_Inter] text-[#3FD17F]">{t('landing.example.open')} →</span>
      </span>
    </Link>
  );
}
