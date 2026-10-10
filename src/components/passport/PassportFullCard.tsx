import { ArtZoom } from '@/components/artviewer';
import { useI18n } from '@/i18n';
import type { PassportPageData } from '@/types/achievements';
import { credentialImageUrl } from '@/services/credential.service';
import { tierLabel } from '@/utils/tier';
import { shortAddress } from '@/lib/explorer';
import { CopyButton } from './CopyButton';
import { OnChainMark } from './OnChainMark';
import { PassportArt } from './PassportArt';
import { PassportPage } from './PassportPage';
import { pageColor, pageVariant } from './pageVariant';
import { isGold } from '@/utils/passport';

const formatDate = (iso: string | null, locale: string): string | null => {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  if (locale === 'en') return at.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  return `${String(at.getUTCDate()).padStart(2, '0')}/${String(at.getUTCMonth() + 1).padStart(2, '0')}/${at.getUTCFullYear()}`;
};

/** A 300x400 page of /passport with its facts and chain links underneath. */
export function PassportFullCard({ page }: { page: PassportPageData }) {
  const { t, locale } = useI18n();
  const minted = page.mintStatus === 'minted' && Boolean(page.assetAddress || page.txSignature);
  const date = formatDate(page.earnedAt, locale);
  const art = page.credentialId ? credentialImageUrl(page.credentialId, locale, `${page.daysDone}-${page.tier ?? ''}`) : null;

  return (
    <article data-testid="passport-full-card" className="flex w-full max-w-[300px] flex-col gap-3 justify-self-center">
      <ArtZoom title={page.trailTitle} line={t('viewer.cert.line', { done: page.daysDone, total: page.totalDays })} src={art} asset={minted ? page.assetAddress : null} aspect={3 / 4} full={art ? undefined : <PassportPage title={page.trailTitle} color={pageColor(page)} total={page.totalDays} done={page.daysDone} variant={pageVariant(page)} ribbon={t('passport.ribbon')} />}>
      <PassportArt
        src={art}
        title={page.trailTitle}
        color={pageColor(page)}
        total={page.totalDays}
        done={page.daysDone}
        variant={pageVariant(page)}
        ribbon={t('passport.ribbon')}
      />
      </ArtZoom>
      <div className="flex flex-col gap-1.5 [font:500_13px_JetBrains_Mono] text-[#C9BFB0]">
        <span className="[font:700_24px/1_'Barlow_Condensed'] text-[#F4EDE2]">{page.trailTitle}</span>
        <span>
          {t('passport.days', { done: page.daysDone, total: page.totalDays })}
          {page.tier && ` · ${t('passport.tier', { tier: tierLabel(t, page.tier) })}`}
        </span>
        {date && <span className="text-[#A0978A]">{t(isGold(page) ? 'passport.earnedOn' : 'passport.startedOn', { date })}</span>}
        {minted && (
          <span className="flex flex-wrap items-center gap-2 pt-1">
            <OnChainMark txSignature={page.txSignature} assetAddress={page.assetAddress} />
            {page.assetAddress && (
              <CopyButton value={page.assetAddress} label={t('passport.copyAddress')} doneLabel={t('passport.copied')} display={shortAddress(page.assetAddress)} />
            )}
          </span>
        )}
      </div>
    </article>
  );
}
