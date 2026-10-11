import { useMutation } from '@tanstack/react-query';
import { ChainProof } from '@/components/chain/ChainProof';
import { Notice } from '@/components/bounty/bountyUi';
import { Bullets, Labelled, MONO_TEXT, P, RunButton, VerifySection } from '@/components/verify/VerifyParts';
import { CopyButton } from '@/components/passport/CopyButton';
import { fetchPublishedBytes } from '@/hooks/useChainRead';
import { useProgramData } from '@/hooks/useProgramData';
import { useI18n } from '@/i18n';
import { ESCROW_PROGRAM } from '@/lib/chain/escrowAccount';
import { parseProgramDataHeader, programDataAddress } from '@/lib/chain/programData';
import { readAccount } from '@/lib/chain/rpc';
import { BINARY_PATH, compareBinary, IDL_PATH, type BinaryCheck, type EscrowIdl } from '@/lib/chain/verifyChecks';

function LiveAuthority() {
  const { t } = useI18n();
  const { program, dataAddress, header } = useProgramData();
  const parsed = header.data ? parseProgramDataHeader(header.data.data) : null;
  if (program.isPending || (dataAddress !== null && header.isPending)) return <Notice testId="program-live">{t('verify.program.loading')}</Notice>;
  if (program.isError || header.isError) {
    return (
      <Notice tone="error" testId="program-live">
        {t('verify.program.error')}{' '}
        <button type="button" className="underline" onClick={() => void (program.isError ? program.refetch() : header.refetch())}>{t('bounty.retry')}</button>
      </Notice>
    );
  }
  if (!program.data || !dataAddress || !parsed) return <Notice tone="error" testId="program-live">{t('verify.program.notProgram')}</Notice>;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-[#262320] bg-[#0A0908] p-3" data-testid="program-live">
      <Labelled label={t('verify.program.authority')}>
        <span data-testid="program-authority">{parsed.upgradeAuthority ?? t('verify.program.noAuthority')}</span>
      </Labelled>
      <Labelled label={t('verify.program.deployed')}>
        <span data-testid="program-slot">{parsed.lastDeployedSlot.toLocaleString('en-US')}</span>
      </Labelled>
      <Labelled label={t('verify.program.dataAccount')}>{dataAddress}</Labelled>
      <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.raw.readBy', { slot: (header.data?.slot ?? 0).toLocaleString('en-US') })}</p>
    </div>
  );
}

async function checkDeployedCode(): Promise<BinaryCheck> {
  const program = await readAccount(ESCROW_PROGRAM);
  const dataAddress = program ? programDataAddress(program.data) : null;
  if (!dataAddress) throw new Error('not a program');
  const [data, binary, idl] = await Promise.all([readAccount(dataAddress), fetchPublishedBytes(BINARY_PATH), fetch(IDL_PATH).then((response) => response.json() as Promise<EscrowIdl>)]);
  if (!data) throw new Error('no data account');
  return compareBinary(data.data, binary, idl.metadata.binary_sha256);
}

function CodeCheck() {
  const { t } = useI18n();
  const check = useMutation({ mutationFn: checkDeployedCode });
  const result = check.data;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="program-check">
      <RunButton label={t('verify.program.check')} busyLabel={t('verify.program.checking')} busy={check.isPending} onClick={() => check.mutate()} />
      {check.isError && <Notice tone="error">{t('verify.program.checkError')}</Notice>}
      {result && (
        <div className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-[#262320] bg-[#0A0908] p-3">
          <Labelled label={t('verify.program.hashChain', { n: result.bytes })}>{result.onChain}</Labelled>
          <Labelled label={t('verify.program.hashFile')}>{result.file}</Labelled>
          <Labelled label={t('verify.program.hashIdl')}>{result.published}</Labelled>
          <p className={`[font:700_16px_JetBrains_Mono] ${result.match ? 'text-[#3FD17F]' : 'text-[#E0655A]'}`} role="status" data-testid="program-verdict">
            {result.match ? t('verify.program.match') : t('verify.program.different')}
          </p>
          <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.program.padding')}</p>
        </div>
      )}
    </div>
  );
}

export function ProgramSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="program" title={t('verify.program.title')}>
      <p className={P}>{t('verify.program.intro')}</p>
      <div className="flex min-w-0 flex-col gap-2">
        <span className={MONO_TEXT} data-testid="program-id">{ESCROW_PROGRAM}</span>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={ESCROW_PROGRAM} label={t('bounty.copy')} doneLabel={t('bounty.copied')} />
          <ChainProof kind="address" value={ESCROW_PROGRAM} />
        </div>
      </div>
      <LiveAuthority />
      <Bullets items={[t('verify.program.oneKey'), t('verify.program.why'), t('verify.program.before')]} />
      <p className={P}>{t('verify.program.checkIntro')}</p>
      <CodeCheck />
    </VerifySection>
  );
}
