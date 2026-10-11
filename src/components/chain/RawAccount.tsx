import { CodeBlock, CurlLine, RAW_BOX, RawField, RawFields, RawNote, RawStatus, RawSubtitle } from '@/components/chain/RawParts';
import { useChainAccount } from '@/hooks/useChainRead';
import { useI18n } from '@/i18n';
import { parseCoreAsset, MPL_CORE_PROGRAM, type CoreAsset } from '@/lib/chain/coreAsset';
import { ESCROW_PROGRAM, parseEscrowAccount, type EscrowAccount } from '@/lib/chain/escrowAccount';
import { formatSol, hexRows } from '@/lib/chain/format';
import { accountParams, curlFor, PUBLIC_RPC, type RawAccount as RawAccountData } from '@/lib/chain/rpc';

function DecodedAsset({ asset, data }: { asset: CoreAsset; data: Uint8Array }) {
  const { t } = useI18n();
  const frozenByte = asset.frozenBy ? data[asset.frozenBy.offset] : null;
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="raw-decoded-asset">
      <RawSubtitle>{t('verify.raw.decodedAsset')}</RawSubtitle>
      <RawFields>
        <RawField label={t('verify.raw.assetOwner')}>{asset.owner}</RawField>
        <RawField label={t('verify.raw.assetCollection')}>{asset.collection ?? t('verify.raw.none')}</RawField>
        <RawField label={t('verify.raw.assetFrozen')} testId="raw-frozen">
          {asset.frozen && asset.frozenBy
            ? t('verify.raw.frozenYes', { plugin: asset.frozenBy.plugin, offset: asset.frozenBy.offset, value: (frozenByte ?? 0).toString(16).padStart(2, '0') })
            : t('verify.raw.frozenNo')}
        </RawField>
        <RawField label={t('verify.raw.assetName')}>{asset.name}</RawField>
        <div className="sm:col-span-2">
          <RawField label={t('verify.raw.assetUri')}>{asset.uri}</RawField>
        </div>
      </RawFields>
      <RawSubtitle>{t('verify.raw.assetPlugins')}</RawSubtitle>
      <ul className="flex flex-col gap-1 [font:500_12px/1.4_JetBrains_Mono] text-[#C9BFB0]">
        {asset.plugins.map((plugin) => (
          <li key={`${plugin.type}-${plugin.offset}`} className="break-all">
            {t('verify.raw.pluginLine', { name: plugin.name, authority: plugin.authority, offset: plugin.offset })}
          </li>
        ))}
      </ul>
      <RawSubtitle>{t('verify.raw.assetAttributes')}</RawSubtitle>
      <dl className="grid min-w-0 gap-x-3 gap-y-1.5 [grid-template-columns:minmax(0,auto)_minmax(0,1fr)]" data-testid="raw-attributes">
        {asset.attributes.map((entry) => (
          <div key={entry.key} className="contents">
            <dt className="break-all [font:600_12px/1.4_JetBrains_Mono] text-[#A0978A]">{entry.key}</dt>
            <dd className="break-all [font:500_12px/1.4_JetBrains_Mono] text-[#F4EDE2]">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DecodedEscrow({ escrow }: { escrow: EscrowAccount }) {
  const { t, locale } = useI18n();
  const expires = new Date(escrow.expiresAt * 1000);
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="raw-decoded-escrow">
      <RawSubtitle>{t('verify.raw.decodedEscrow')}</RawSubtitle>
      <RawFields>
        <RawField label={t('verify.raw.escrowStatus')} testId="raw-escrow-status">{escrow.status}</RawField>
        <RawField label={t('verify.raw.escrowAmount')}>{formatSol(escrow.lamports)}</RawField>
        <RawField label={t('verify.raw.escrowClaimant')}>{escrow.claimant ?? t('verify.raw.nobody')}</RawField>
        <RawField label={t('verify.raw.escrowCertification')}>{escrow.certification ?? t('verify.raw.none')}</RawField>
        <RawField label={t('verify.raw.escrowSponsor')}>{escrow.sponsor}</RawField>
        <RawField label={t('verify.raw.escrowApprover')}>{escrow.approver}</RawField>
        <RawField label={t('verify.raw.escrowCollection')}>{escrow.collection}</RawField>
        <RawField label={t('verify.raw.escrowExpires')}>
          {Number.isFinite(expires.getTime()) ? expires.toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'medium' }) : String(escrow.expiresAt)}
        </RawField>
        <RawField label={t('verify.raw.escrowId')}>{escrow.bountyId}</RawField>
      </RawFields>
    </section>
  );
}

function Body({ account }: { account: RawAccountData }) {
  const { t } = useI18n();
  const asset = account.owner === MPL_CORE_PROGRAM ? parseCoreAsset(account.data) : null;
  const escrow = account.owner === ESCROW_PROGRAM ? parseEscrowAccount(account.data) : null;
  const rows = hexRows(account.data);
  return (
    <div className={RAW_BOX} data-testid="raw-account">
      <RawNote>{t('verify.raw.readBy', { slot: account.slot.toLocaleString('en-US') })}</RawNote>
      <RawFields>
        <RawField label={t('verify.raw.owner')}>{account.owner}</RawField>
        <RawField label={t('verify.raw.balance')}>{formatSol(account.lamports)}</RawField>
        <RawField label={t('verify.raw.length')}>{t('verify.raw.bytes', { n: account.data.length })}</RawField>
      </RawFields>
      {asset && <DecodedAsset asset={asset} data={account.data} />}
      {escrow && <DecodedEscrow escrow={escrow} />}
      <details className="min-w-0">
        <summary className="inline-flex min-h-11 cursor-pointer items-center [font:700_13px_JetBrains_Mono] text-[#3FD17F]">{t('verify.raw.hex', { n: rows.length ? Math.min(account.data.length, 256) : 0 })}</summary>
        <div className="mt-2 flex min-w-0 flex-col gap-3">
          <CodeBlock label={t('verify.raw.hexLabel')}>{rows.map((row) => `${row.offset}  ${row.bytes}`).join('\n')}</CodeBlock>
          <RawNote>{t('verify.raw.curlNote', { rpc: PUBLIC_RPC.replace('https://', '') })}</RawNote>
          <CurlLine command={curlFor('getAccountInfo', accountParams(account.address))} />
        </div>
      </details>
    </div>
  );
}

/** One account, read by the visitor's browser from a public node and decoded when Itera knows its layout. */
export function RawAccount({ address }: { address: string }) {
  const { t } = useI18n();
  const query = useChainAccount(address);
  if (query.isPending) return <RawStatus text={t('verify.raw.loading')} />;
  if (query.isError) return <RawStatus error text={t('verify.raw.error')} onRetry={() => void query.refetch()} />;
  if (!query.data) return <RawStatus text={t('verify.raw.missing')} />;
  return <Body account={query.data} />;
}
