import { useState } from 'react';
import { VerifySection, Labelled, P } from '@/components/verify/VerifyParts';
import { LINK } from '@/components/bounty/bountyUi';
import { fetchPublishedBytes, usePublishedJson } from '@/hooks/useChainRead';
import { resources, useI18n } from '@/i18n';
import { ESCROW_LAYOUT, ESCROW_STATE_BYTES, DIRECT_ESCROW_LAYOUT, DIRECT_ESCROW_STATE_BYTES, GATED_ESCROW_LAYOUT, GATED_ESCROW_STATE_BYTES } from '@/lib/chain/escrowAccount';
import { sha256Hex } from '@/lib/chain/base58';
import { BINARY_PATH, IDL_PATH, instructionRows, localizeRow, PUBLISHED_RECORD, SOURCE_PATH, type EscrowIdl } from '@/lib/chain/verifyChecks';
import { shortAddress, txUrl } from '@/lib/explorer';

const TH = '[font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A] text-left py-2 pr-3 align-bottom';
const TD = 'py-2 pr-3 align-top [font:500_12px/1.5_JetBrains_Mono] text-[#F4EDE2]';

function Instructions({ idl }: { idl: EscrowIdl }) {
  const { t, locale } = useI18n();
  return (
    <div className="max-w-full overflow-x-auto" data-testid="idl-instructions">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-[#262320]">
            <th className={TH}>{t('verify.source.colName')}</th>
            <th className={TH}>{t('verify.source.colSigners')}</th>
            <th className={TH}>{t('verify.source.colChecks')}</th>
          </tr>
        </thead>
        <tbody>
          {instructionRows(idl).map((raw) => ({ key: raw.name, row: localizeRow(raw, resources[locale]) })).map(({ key, row }) => (
            <tr key={key} className="border-b border-[#1C1916]">
              <td className={TD}>{row.name}</td>
              <td className={TD}>{row.signers[0]}</td>
              <td className={`${TD} [font-family:Inter] text-[#C9BFB0]`}>{row.checks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 [font:400_12px/1.5_Inter] text-[#A0978A]" data-testid="idl-memo">{t('verify.source.memo')}</p>
      <p className="mt-1 [font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.source.attesterNote')}</p>
    </div>
  );
}

function Layout({ rows, testId }: { rows: ReadonlyArray<{ field: string; offset: number; length: number }>; testId: string }) {
  const { t } = useI18n();
  return (
    <div className="max-w-full overflow-x-auto" data-testid={testId}>
      <table className="w-full min-w-[320px] border-collapse">
        <thead>
          <tr className="border-b border-[#262320]">
            <th className={TH}>{t('verify.source.colField')}</th>
            <th className={TH}>{t('verify.source.colOffset')}</th>
            <th className={TH}>{t('verify.source.colLength')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className="border-b border-[#1C1916]">
              <td className={TD}>{row.field}</td>
              <td className={TD}>{row.offset}</td>
              <td className={TD}>{row.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Hashed = Record<string, string> | 'working' | 'failed' | null;

/** The hashes of the published files as written on Solana, and the same files hashed here in the visitor's browser. */
function PublishedRecord() {
  const { t } = useI18n();
  const [hashed, setHashed] = useState<Hashed>(null);
  const run = async () => {
    setHashed('working');
    try {
      const pairs = await Promise.all(PUBLISHED_RECORD.files.map(async (file) => [file.path, await sha256Hex(await fetchPublishedBytes(file.path))] as const));
      setHashed(Object.fromEntries(pairs));
    } catch {
      setHashed('failed');
    }
  };
  const done = hashed !== null && typeof hashed === 'object' ? hashed : null;
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-[#262320] bg-[#0A0908] p-3" data-testid="published-record">
      <p className={P}>
        {t('verify.source.record', { signer: shortAddress(PUBLISHED_RECORD.signer), date: PUBLISHED_RECORD.date })}{' '}
        <a href={txUrl(PUBLISHED_RECORD.signature)} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="published-record-tx">
          {t('verify.source.recordTx')} ↗
        </a>
      </p>
      <ul className="flex flex-col gap-1">
        {PUBLISHED_RECORD.files.map((file) => (
          <li key={file.path} className="flex flex-col [font:500_12px/1.5_JetBrains_Mono] text-[#C9BFB0]" data-testid="published-record-file" data-match={done ? String(done[file.path] === file.sha256) : 'unknown'}>
            <span className="break-all">
              {file.label}={file.sha256}
            </span>
            {done && (
              <span className={done[file.path] === file.sha256 ? 'text-[#3FD17F]' : 'text-[#E0655A]'}>
                {done[file.path] === file.sha256 ? t('verify.source.recordSame', { path: file.path }) : t('verify.source.recordDifferent', { path: file.path })}
              </span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void run()} disabled={hashed === 'working'} className={`${LINK} self-start disabled:opacity-60`} data-testid="published-record-check">
        {hashed === 'working' ? t('verify.source.recordWorking') : t('verify.source.recordCheck')}
      </button>
      {hashed === 'failed' && <p role="alert" className="[font:500_13px_Inter] text-[#E0655A]">{t('verify.source.recordFailed')}</p>}
    </div>
  );
}

export function SourceSection() {
  const { t } = useI18n();
  const idl = usePublishedJson<EscrowIdl>(IDL_PATH);
  return (
    <VerifySection id="source" title={t('verify.source.title')}>
      <p className={P}>{t('verify.source.intro')}</p>
      <ul className="flex flex-col">
        {[SOURCE_PATH, IDL_PATH, BINARY_PATH].map((path) => (
          <li key={path}>
            <a href={path} target="_blank" rel="noopener noreferrer" className={`${LINK} break-all`}>
              {path} ↗
            </a>
          </li>
        ))}
      </ul>
      <p className={P}>{t('verify.source.private')}</p>
      <PublishedRecord />
      {idl.isPending && <p className={P}>{t('verify.source.loading')}</p>}
      {idl.isError && (
        <p role="alert" className="[font:500_14px_Inter] text-[#E0655A]">
          {t('verify.source.error')}{' '}
          <button type="button" className="underline" onClick={() => void idl.refetch()}>{t('bounty.retry')}</button>
        </p>
      )}
      {idl.data && (
        <>
          <Instructions idl={idl.data} />
          <Labelled label={t('verify.source.builtBy')}>{idl.data.metadata.built_by}</Labelled>
        </>
      )}
      <p className={P}>{t('verify.source.layout', { n: ESCROW_STATE_BYTES, gated: GATED_ESCROW_STATE_BYTES, direct: DIRECT_ESCROW_STATE_BYTES })}</p>
      <Layout rows={ESCROW_LAYOUT} testId="escrow-layout" />
      <p className={P}>{t('verify.source.layoutGated', { n: ESCROW_STATE_BYTES, gated: GATED_ESCROW_STATE_BYTES })}</p>
      <Layout rows={GATED_ESCROW_LAYOUT.filter((row) => row.offset >= ESCROW_STATE_BYTES)} testId="gated-escrow-layout" />
      <p className={P}>{t('verify.source.layoutDirect', { gated: GATED_ESCROW_STATE_BYTES, direct: DIRECT_ESCROW_STATE_BYTES })}</p>
      <Layout rows={DIRECT_ESCROW_LAYOUT.filter((row) => row.offset >= GATED_ESCROW_STATE_BYTES)} testId="direct-escrow-layout" />
    </VerifySection>
  );
}
