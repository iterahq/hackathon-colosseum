import { useMutation, useQuery } from '@tanstack/react-query';
import { FOCUS_EARN_STORY_OFF } from '@/config/focus';
import { Link } from 'react-router-dom';
import { LINK, SECTION_TITLE } from '@/components/bounty/bountyUi';
import { BTN_SECONDARY, BTN_SMALL, CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { parseCoreAsset } from '@/lib/chain/coreAsset';
import { readAccount } from '@/lib/chain/rpc';
import { shortAddress } from '@/lib/explorer';
import { queryKeys } from '@/lib/queryKeys';
import { arweaveOwnerOf, checkCopy, syncCredentialArchive, type ArchiveCopy, type CopyCheck, type CredentialArchive } from '@/services/credentialArchive.service';

const CLAIM_PREFIX = 'claim:';
const TEXT = '[font:400_14px/1.5_Inter] text-[#C9BFB0]';
const SMALL = '[font:400_13px/1.5_Inter] text-[#A0978A]';

/** Downloads every copy, hashes it here, and compares evidence hashes with the asset account read from Solana. */
async function checkAll(archive: CredentialArchive): Promise<CopyCheck[]> {
  const account = await readAccount(archive.asset).catch(() => null);
  const asset = account ? parseCoreAsset(account.data) : null;
  const claims = new Map((asset?.attributes ?? []).filter((entry) => entry.key.startsWith(CLAIM_PREFIX)).map((entry) => [entry.key.slice(CLAIM_PREFIX.length), entry.value]));
  const copies = [archive.metadata, archive.image, ...archive.evidence].filter((copy): copy is ArchiveCopy => copy !== null);
  return Promise.all(copies.map((copy) => checkCopy(copy, claims)));
}

function CopyRow({ copy, label, check }: { copy: ArchiveCopy; label: string; check: CopyCheck | undefined }) {
  const { t } = useI18n();
  const good = check ? check.intact && check.matchesChain !== false : null;
  return (
    <li className="flex flex-col gap-1 border-t border-[#262320] py-2.5 first:border-t-0" data-testid="archive-copy" data-kind={copy.kind} data-check={good === null ? 'none' : good ? 'ok' : 'bad'}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <span className="min-w-0 break-words [font:600_14px_Inter] text-[#F4EDE2]">{label}</span>
        <a href={copy.urls[0]} target="_blank" rel="noopener noreferrer" className={LINK}>
          {t('archive.open')} ↗
        </a>
      </div>
      <span className="break-all [font:500_12px_JetBrains_Mono] text-[#A0978A]">sha256 {copy.sha256}</span>
      {check && (
        <p className={`[font:500_13px/1.45_Inter] ${good ? 'text-[#3FD17F]' : 'text-[#E0655A]'}`} role="status">
          {check.computed === null ? t('archive.check.missing') : check.intact ? t('archive.check.intact', { hash: check.computed.slice(0, 16) }) : t('archive.check.broken')}
          {check.computed !== null && check.matchesChain === true && ` ${t('archive.check.chain', { value: check.onchain ?? '' })}`}
          {check.computed !== null && check.matchesChain === false && ` ${check.onchain ? t('archive.check.noChain', { value: check.onchain }) : t('archive.check.noClaim')}`}
        </p>
      )}
    </li>
  );
}

/** The permanent copies of one credential, with a check the visitor's own browser runs. */
export function ArchiveCopies({ asset }: { asset: string }) {
  const { t, locale } = useI18n();
  const archive = useQuery({ queryKey: queryKeys.chain.archive(asset), queryFn: () => syncCredentialArchive(asset), staleTime: 60_000, retry: 1 });
  const owner = useQuery({ queryKey: queryKeys.chain.archiveOwner(archive.data?.signer ?? ''), queryFn: () => arweaveOwnerOf(archive.data?.signer ?? ''), enabled: Boolean(archive.data?.signer), staleTime: Infinity });
  const checks = useMutation({ mutationFn: checkAll });

  const data = archive.data;
  const copies = data ? [data.metadata, data.image, ...data.evidence].filter((copy): copy is ArchiveCopy => copy !== null) : [];
  const checkOf = (copy: ArchiveCopy) => checks.data?.find((entry) => entry.copy.arweaveId === copy.arweaveId);
  const passed = checks.data?.filter((entry) => entry.intact && entry.matchesChain !== false).length ?? 0;
  const when = data?.metadata?.archivedAt ? new Date(data.metadata.archivedAt).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="credential-archive" data-testid="credential-archive">
      <div className="flex flex-col gap-1">
        <h2 id="credential-archive" className={SECTION_TITLE}>{t('archive.title')}</h2>
        <p className={TEXT}>{t('archive.plain')}</p>
      </div>
      {archive.isPending && <p className={SMALL} role="status">{t('archive.loading')}</p>}
      {archive.isError && (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className={TEXT}>{t('archive.error')}</p>
          <button type="button" onClick={() => void archive.refetch()} className={`${BTN_SECONDARY} ${BTN_SMALL}`}>{t('archive.retry')}</button>
        </div>
      )}
      {archive.isSuccess && copies.length === 0 && <p className={TEXT} data-testid="archive-none">{t('archive.none')}</p>}
      {data && copies.length > 0 && (
        <>
          {data.failedUploads > 0 && <p className={SMALL}>{t('archive.partial', { n: data.failedUploads })}</p>}
          <ul className="flex flex-col">
            {data.metadata && <CopyRow copy={data.metadata} label={t('archive.metadata')} check={checkOf(data.metadata)} />}
            {data.image && <CopyRow copy={data.image} label={t('archive.image')} check={checkOf(data.image)} />}
          </ul>
          {data.evidence.length > 0 && (
            <details className="rounded-[10px] border border-[#262320] px-3 py-1" open={Boolean(checks.data)}>
              <summary className="flex min-h-11 cursor-pointer items-center [font:600_14px_Inter] text-[#F4EDE2]">{t('archive.evidence', { n: data.evidence.length })}</summary>
              <ul className="flex flex-col">
                {data.evidence.map((copy) => (
                  <CopyRow key={copy.arweaveId} copy={copy} label={copy.claim ?? copy.arweaveId} check={checkOf(copy)} />
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-col items-start gap-2">
            <button type="button" disabled={checks.isPending} onClick={() => checks.mutate(data)} className={`${BTN_SECONDARY} ${BTN_SMALL}`} data-testid="archive-check">
              {checks.isPending ? t('archive.checking') : t('archive.check')}
            </button>
            {checks.data && (
              <p className={`[font:600_14px/1.45_Inter] ${passed === checks.data.length ? 'text-[#3FD17F]' : 'text-[#E0655A]'}`} role="status" data-testid="archive-check-summary">
                {t('archive.check.summary', { ok: passed, total: checks.data.length })}
              </p>
            )}
          </div>
          <p className={SMALL}>
            {t('archive.signed', { signer: shortAddress(data.signer), owner: owner.data ? `${owner.data.slice(0, 6)}…${owner.data.slice(-4)}` : '…' })}
            {when && ` ${t('archive.when', { date: when })}`}
          </p>
          <p className={SMALL}>{t('archive.gateways')}</p>
          <p className={SMALL}>{t('archive.notOnAsset')}</p>
          {data.findQuery && (
            <details className="rounded-[10px] border border-[#262320] px-3 py-1">
              <summary className="flex min-h-11 cursor-pointer items-center [font:600_14px_Inter] text-[#F4EDE2]">{t('archive.find')}</summary>
              <p className={`${SMALL} pb-2`}>{t('archive.find.plain')}</p>
              <p className={`${MONO_LABEL} pb-1 normal-case text-[#A0978A]`}>{data.findEndpoints.join(' · ')}</p>
              <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-all rounded-[8px] bg-[#0A0908] p-3 [font:500_12px/1.5_JetBrains_Mono] text-[#C9BFB0]">{data.findQuery}</pre>
            </details>
          )}
        </>
      )}
      {!FOCUS_EARN_STORY_OFF && <Link to="/verify#durable" className={`${LINK} self-start`}>{t('archive.learn')}</Link>}
    </section>
  );
}
