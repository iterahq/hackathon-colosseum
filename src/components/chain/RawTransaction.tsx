import { CodeBlock, CurlLine, RAW_BOX, RawField, RawFields, RawNote, RawStatus, RawSubtitle } from '@/components/chain/RawParts';
import { useChainTransaction } from '@/hooks/useChainRead';
import { useI18n } from '@/i18n';
import { formatSol } from '@/lib/chain/format';
import { curlFor, PUBLIC_RPC, transactionParams, type RawTransaction as RawTransactionData } from '@/lib/chain/rpc';

function Body({ tx }: { tx: RawTransactionData }) {
  const { t, locale } = useI18n();
  return (
    <div className={RAW_BOX} data-testid="raw-transaction">
      <RawNote>{t('verify.raw.readBy', { slot: tx.slot.toLocaleString('en-US') })}</RawNote>
      <RawFields>
        <RawField label={t('verify.tx.status')} testId="raw-tx-status">{t(tx.failed ? 'verify.tx.failed' : 'verify.tx.succeeded')}</RawField>
        <RawField label={t('verify.tx.fee')}>{formatSol(tx.feeLamports)}</RawField>
        <RawField label={t('verify.tx.time')}>
          {tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'medium', timeStyle: 'medium' }) : t('verify.tx.noTime')}
        </RawField>
      </RawFields>
      <RawSubtitle>{t('verify.tx.signers')}</RawSubtitle>
      <ul className="flex flex-col gap-1 [font:500_12px/1.4_JetBrains_Mono] text-[#F4EDE2]" data-testid="raw-tx-signers">
        {tx.signers.map((signer, index) => (
          <li key={signer} className="break-all">
            {signer}
            {index === 0 && <span className="ml-2 text-[#A0978A]">({t('verify.tx.feePayer')})</span>}
          </li>
        ))}
      </ul>
      <RawSubtitle>{t('verify.tx.programs')}</RawSubtitle>
      <ul className="flex flex-col gap-1 [font:500_12px/1.4_JetBrains_Mono] text-[#C9BFB0]">
        {tx.programs.map((program) => (
          <li key={program} className="break-all">{program}</li>
        ))}
      </ul>
      <details className="min-w-0">
        <summary className="inline-flex min-h-11 cursor-pointer items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F]">{t('verify.tx.logs', { n: tx.logs.length })}</summary>
        <div className="mt-2 flex min-w-0 flex-col gap-3">
          <CodeBlock label={t('verify.tx.logsLabel')}>{tx.logs.join('\n')}</CodeBlock>
        </div>
      </details>
      <RawNote>{t('verify.raw.curlNote', { rpc: PUBLIC_RPC.replace('https://', '') })}</RawNote>
      <CurlLine command={curlFor('getTransaction', transactionParams(tx.signature))} />
    </div>
  );
}

export function RawTransaction({ signature }: { signature: string }) {
  const { t } = useI18n();
  const query = useChainTransaction(signature);
  if (query.isPending) return <RawStatus text={t('verify.raw.loading')} />;
  if (query.isError) return <RawStatus error text={t('verify.raw.error')} onRetry={() => void query.refetch()} />;
  if (!query.data) return <RawStatus text={t('verify.tx.missing')} />;
  return <Body tx={query.data} />;
}
