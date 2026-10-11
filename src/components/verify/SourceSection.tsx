import { VerifySection, Labelled, P } from '@/components/verify/VerifyParts';
import { LINK } from '@/components/bounty/bountyUi';
import { usePublishedJson } from '@/hooks/useChainRead';
import { useI18n } from '@/i18n';
import { ESCROW_LAYOUT, ESCROW_STATE_BYTES } from '@/lib/chain/escrowAccount';
import { BINARY_PATH, IDL_PATH, instructionRows, SOURCE_PATH, type EscrowIdl } from '@/lib/chain/verifyChecks';

const TH = '[font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A] text-left py-2 pr-3 align-bottom';
const TD = 'py-2 pr-3 align-top [font:500_12px/1.5_JetBrains_Mono] text-[#F4EDE2]';

function Instructions({ idl }: { idl: EscrowIdl }) {
  const { t } = useI18n();
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
          {instructionRows(idl).map((row) => (
            <tr key={row.name} className="border-b border-[#1C1916]">
              <td className={TD}>{row.name}</td>
              <td className={TD}>{row.signers.join(', ')}</td>
              <td className={`${TD} [font-family:Inter] text-[#C9BFB0]`}>{row.checks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Layout() {
  const { t } = useI18n();
  return (
    <div className="max-w-full overflow-x-auto" data-testid="escrow-layout">
      <table className="w-full min-w-[320px] border-collapse">
        <thead>
          <tr className="border-b border-[#262320]">
            <th className={TH}>{t('verify.source.colField')}</th>
            <th className={TH}>{t('verify.source.colOffset')}</th>
            <th className={TH}>{t('verify.source.colLength')}</th>
          </tr>
        </thead>
        <tbody>
          {ESCROW_LAYOUT.map((row) => (
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
      <p className={P}>{t('verify.source.layout', { n: ESCROW_STATE_BYTES })}</p>
      <Layout />
    </VerifySection>
  );
}
