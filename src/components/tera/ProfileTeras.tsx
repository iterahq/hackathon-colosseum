import { Link } from 'react-router-dom';
import { RARITY_EDGE } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { txUrl } from '@/lib/explorer';
import { chestVerifyPath } from '@/services/teraChest.service';
import type { ProfileAvatarNft } from '@/types/learnerProfile';
import type { TeraOriginKind } from '@/types/tera';
import { OriginBadge } from './OriginBadge';

const CARD = 'rounded-[14px] border border-[#262320] bg-[#141210]';
const LINK = 'inline-flex min-h-11 items-center rounded [font:600_12px_JetBrains_Mono] text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]';
const ORDER: readonly TeraOriginKind[] = ['earned', 'sponsor', 'bought'];
const edgeOf = (rarity: string | null | undefined): string => (rarity && rarity in RARITY_EDGE ? RARITY_EDGE[rarity as keyof typeof RARITY_EDGE] : '#5E574E');

/** True when the profile's Teras say how they were obtained: until then the page keeps its plain strip. */
export const hasOrigins = (items: readonly ProfileAvatarNft[]): boolean => items.some((a) => a.origin != null);

function TeraCard({ tera }: { tera: ProfileAvatarNft }) {
  const { t } = useI18n();
  const origin = tera.origin;
  if (!origin) return null;
  const asset = origin.proof?.asset ?? tera.asset ?? null;
  const edge = origin.kind === 'sponsor' ? (origin.sponsor?.accent ?? '#F4EDE2') : edgeOf(origin.earned?.tier || tera.rarity);
  return (
    <li className={`${CARD} flex min-w-0 items-center gap-3 p-3`} data-testid="profile-tera" data-origin={origin.kind} data-item={tera.key}>
      <img src={tera.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-full bg-[#0A0908] object-cover" style={{ boxShadow: `0 0 0 2px ${edge}` }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate [font:700_22px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">
          {tera.title}
          {tera.serial ? <span className="[font:600_12px_JetBrains_Mono] text-[#A0978A]"> #{tera.serial}</span> : null}
        </span>
        <span className="truncate [font:600_11px_JetBrains_Mono] uppercase tracking-[.06em]" style={{ color: edge === '#5E574E' ? '#C9BFB0' : edge }}>
          {tera.tierName}
        </span>
        {origin.earned && origin.earned.day > 0 && <span className="truncate [font:500_13px/1.3_Inter] text-[#C9BFB0]" data-testid="profile-tera-day">{t('origin.earnedAt', { trail: origin.earned.trail, day: origin.earned.day })}</span>}
        {origin.sponsor?.bountyTitle && <span className="truncate [font:500_13px/1.3_Inter] text-[#C9BFB0]" data-testid="profile-tera-bounty-title">{origin.sponsor.bountyTitle}</span>}
        <OriginBadge origin={origin} />
        <span className="-mb-2 -mt-1 flex flex-wrap gap-x-4">
          {asset && (
            <Link to={`/c/${asset}`} className={LINK} data-testid="profile-tera-proof">
              {t('origin.proof')} →
            </Link>
          )}
          {origin.earned?.chestId && (
            <Link to={chestVerifyPath(origin.earned.chestId)} className={LINK} data-testid="profile-tera-reroll">
              {t('origin.reroll')} →
            </Link>
          )}
          {origin.sponsor?.bountySlug && (
            <Link to={`/bounties/${origin.sponsor.bountySlug}`} className={LINK} data-testid="profile-tera-bounty">
              {t('origin.card.bounty')} →
            </Link>
          )}
          {origin.sponsor?.payoutTx && (
            <a href={txUrl(origin.sponsor.payoutTx)} target="_blank" rel="noopener noreferrer" className={LINK}>
              {t('origin.payout')} ↗
            </a>
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * The Teras of a wallet, in three groups that are never mixed: earned by studying (evidence of work), paid as a
 * bounty prize by a brand, and bought in the shop. Each one says whether it can change hands and links to its proof.
 */
export function ProfileTeras({ items, headingClass }: { items: readonly ProfileAvatarNft[]; headingClass: string }) {
  const { t } = useI18n();
  const known = items.filter((a) => a.origin != null);
  if (known.length === 0) return null;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="profile-teras" data-testid="profile-teras">
      <h2 id="profile-teras" className={headingClass}>{t('origin.section.title')}</h2>
      {ORDER.map((kind) => {
        const group = known.filter((a) => a.origin?.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind} className="flex flex-col gap-2" data-testid={`profile-teras-${kind}`}>
            <div>
              <h3 className="[font:700_20px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">
                {t(`origin.section.${kind}`)} <span className="[font:600_12px_JetBrains_Mono] text-[#A0978A]">{group.length}</span>
              </h3>
              <p className="mt-1 max-w-[62ch] [font:400_13px/1.45_Inter] text-[#A0978A]">{t(`origin.section.${kind}Hint`)}</p>
            </div>
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
              {group.map((a) => (
                <TeraCard key={`${a.key}-${a.serial ?? ''}-${a.asset ?? ''}`} tera={a} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
