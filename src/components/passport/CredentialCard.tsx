import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { addressUrl, shortAddress } from '@/lib/explorer';
import type { CredentialLookup } from '@/types/achievements';
import { tierLabel } from '@/utils/tier';
import { companionFacts, credentialFacts, isCompanion } from '@/utils/credential';
import { CopyButton } from './CopyButton';
import { SnapshotLine } from './SnapshotLine';

type Found = Extract<CredentialLookup, { data: unknown }>;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-[#262320] py-2.5 [font:500_13px_JetBrains_Mono]">
      <dt className="text-[#A0978A]">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center justify-end gap-2 break-all text-right text-[#F4EDE2]">{children}</dd>
    </div>
  );
}

function Check() {
  const reduce = useReducedMotion();
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="14" cy="14" r="12" stroke="#3FD17F" strokeWidth="2" />
      <motion.path d="M8 14.5l4 4 8-9" stroke="#3FD17F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.4 }} />
    </svg>
  );
}

/** The verification card of /c/:asset: the verdict, the facts read from the chain and the explorer link. */
export function CredentialCard({ lookup }: { lookup: Found }) {
  const { t, tText, locale } = useI18n();
  const reduce = useReducedMotion();
  const { data } = lookup;
  const ok = lookup.status === 'verified';
  const f = credentialFacts(data, tText, locale);
  const companion = isCompanion(data) ? companionFacts(data) : null;
  const date = f.date ? new Date(f.date).toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR', { timeZone: 'UTC' }) : null;

  return (
    <motion.section
      data-testid="credential-card"
      data-status={lookup.status}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
      className="w-full rounded-[14px] border bg-[#141210] p-5 sm:p-6"
      style={{ borderColor: ok ? '#3FD17F' : '#E0A86F' }}
    >
      <div className="flex items-center gap-3">
        {ok && <Check />}
        <div className="flex flex-col">
          <h1 className="[font:700_30px/1_'Barlow_Condensed']" style={{ color: ok ? '#3FD17F' : '#E0A86F' }}>
            {ok ? t('passport.credential.verified') : t('passport.credential.unverified')}
          </h1>
          <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{ok ? t('passport.credential.sub') : t('passport.credential.unverifiedBody')}</span>
          {companion && <SnapshotLine mirroredAt={data.snapshot?.mirrored_at} />}
        </div>
      </div>
      <dl className="mt-4">
        {data.owner && (
          <Row label={t('passport.credential.wallet')}>
            {shortAddress(data.owner)}
            <CopyButton value={data.owner} label={t('passport.copyAddress')} doneLabel={t('passport.copied')} display="" />
          </Row>
        )}
        {companion ? (
          <>
            {companion.lives != null && <Row label={t('passport.credential.lives')}>{companion.lives}/{companion.maxLives}</Row>}
            <Row label={t('passport.credential.outfit')}>{companion.outfit ? t(`ux.outfit.${companion.outfit}`) : t('passport.credential.noOutfit')}</Row>
            {companion.level != null && <Row label={t('passport.credential.level')}>{companion.level}</Row>}
            {companion.xp != null && <Row label={t('passport.credential.xp')}>{companion.xp}</Row>}
            {companion.streak != null && <Row label={t('passport.credential.streak')}>{companion.streak}</Row>}
          </>
        ) : (
          <>
            {f.trail && <Row label={t('passport.credential.trail')}>{f.trail}</Row>}
            {f.totalDays > 0 && <Row label={t('passport.credential.days')}>{f.daysDone}/{f.totalDays}</Row>}
            {f.tier && <Row label={t('passport.credential.tier')}>{tierLabel(t, f.tier)}</Row>}
            {date && <Row label={t('passport.credential.date')}>{date}</Row>}
          </>
        )}
        <Row label={t('passport.credential.asset')}>{shortAddress(data.asset)}</Row>
        <Row label={t('passport.credential.soulbound')}>{data.frozen ? t('passport.credential.yes') : t('passport.credential.no')}</Row>
        {!companion && f.days.length > 0 && (
          <Row label={t('passport.credential.attributes')}>
            {f.days.map((d) => (
              <span key={d.day} className="rounded border border-[#2E2A25] px-1.5 py-0.5 text-[11px]" style={{ color: d.done ? '#3FD17F' : '#A0978A' }}>
                {t('passport.credential.dayN', { n: d.day })} {d.done ? '✓' : '○'}
              </span>
            ))}
          </Row>
        )}
      </dl>
      <div className="mt-4 flex flex-col gap-2 [font:500_12px_JetBrains_Mono] text-[#A0978A]">
        <span>{t('passport.credential.readIn', { ms: lookup.ms })}</span>
        <a href={addressUrl(data.asset)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
          {t('passport.credential.explorer')}
        </a>
      </div>
    </motion.section>
  );
}
