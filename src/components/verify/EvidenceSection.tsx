import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Notice } from '@/components/bounty/bountyUi';
import { CurlLine, CodeBlock } from '@/components/chain/RawParts';
import { Labelled, P, RunButton, Steps, TextInput, VerifySection } from '@/components/verify/VerifyParts';
import { useI18n } from '@/i18n';
import { sha256Hex } from '@/lib/chain/base58';
import { attributeOf, parseCoreAsset } from '@/lib/chain/coreAsset';
import { SAMPLE_ASSET, SAMPLE_CLAIM, SAMPLE_WALLET } from '@/lib/chain/samples';
import { readAccount } from '@/lib/chain/rpc';
import { evidenceShellLine, evidenceVerdict, type EvidenceVerdict } from '@/lib/chain/verifyChecks';
import { getClaimEvidence } from '@/services/learnerProfile.service';

const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://nyzcbnnbffsizshiolbh.supabase.co';

interface Outcome {
  document: string;
  recomputed: string;
  onChain: string | null;
  attribute: string;
  assetOwner: string;
  verdict: EvidenceVerdict;
}

async function recompute(input: { wallet: string; claim: string; asset: string }): Promise<Outcome> {
  const evidence = await getClaimEvidence(input.wallet, input.claim);
  const recomputed = await sha256Hex(evidence.evidence);
  const account = await readAccount(input.asset);
  const asset = account ? parseCoreAsset(account.data) : null;
  if (!asset) throw new Error('asset');
  const attribute = `claim:${input.claim}`;
  const onChain = attributeOf(asset, attribute);
  return { document: evidence.evidence, recomputed, onChain, attribute, assetOwner: asset.owner, verdict: evidenceVerdict(onChain, recomputed) };
}

const VERDICT_STYLE: Record<EvidenceVerdict, string> = { match: 'text-[#3FD17F]', 'no-match': 'text-[#E0655A]', 'not-on-chain': 'text-[#F2C66D]' };
const VERDICT_KEY: Record<EvidenceVerdict, string> = { match: 'verify.evidence.match', 'no-match': 'verify.evidence.noMatch', 'not-on-chain': 'verify.evidence.notOnChain' };

export function EvidenceSection() {
  const { t } = useI18n();
  const [wallet, setWallet] = useState(SAMPLE_WALLET);
  const [claim, setClaim] = useState(SAMPLE_CLAIM);
  const [asset, setAsset] = useState(SAMPLE_ASSET);
  const run = useMutation({ mutationFn: recompute });
  const result = run.data;
  const ready = wallet.trim() !== '' && claim.trim() !== '' && asset.trim() !== '';
  return (
    <VerifySection id="evidence" title={t('verify.evidence.title')}>
      <p className={P}>{t('verify.evidence.intro')}</p>
      <p className={P} data-testid="evidence-limit">{t('verify.evidence.limit')}</p>
      <Steps items={[t('verify.evidence.step1'), t('verify.evidence.step2'), t('verify.evidence.step3')]} />
      <div className="grid min-w-0 gap-3">
        <TextInput label={t('verify.evidence.wallet')} value={wallet} onChange={setWallet} />
        {wallet === SAMPLE_WALLET && <p className="[font:400_12px/1.5_Inter] text-[#A0978A]" data-testid="evidence-sample-note">{t('verify.evidence.sampleNote')}</p>}
        <TextInput label={t('verify.evidence.claim')} value={claim} onChange={setClaim} />
        <TextInput label={t('verify.evidence.asset')} value={asset} onChange={setAsset} />
      </div>
      <RunButton
        label={t('verify.evidence.run')}
        busyLabel={t('verify.evidence.running')}
        busy={run.isPending}
        disabled={!ready}
        onClick={() => run.mutate({ wallet: wallet.trim(), claim: claim.trim(), asset: asset.trim() })}
      />
      {run.isError && <Notice tone="error" testId="evidence-error">{t('verify.evidence.error')}</Notice>}
      {result && (
        <div className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-[#262320] bg-[#0A0908] p-3" data-testid="evidence-result">
          <Labelled label={t('verify.evidence.document')}>
            <CodeBlock label={t('verify.evidence.document')}>{result.document}</CodeBlock>
          </Labelled>
          <Labelled label={t('verify.evidence.recomputed')}>{result.recomputed}</Labelled>
          <Labelled label={t('verify.evidence.onChain', { key: result.attribute })}>{result.onChain ?? t('verify.raw.none')}</Labelled>
          {result.assetOwner !== wallet.trim() && <p className="[font:400_12px/1.5_Inter] text-[#F2C66D]">{t('verify.evidence.ownerDiffers', { owner: result.assetOwner })}</p>}
          <p className={`[font:700_16px/1.3_JetBrains_Mono] ${VERDICT_STYLE[result.verdict]}`} role="status" data-testid="evidence-verdict" data-verdict={result.verdict}>
            {t(VERDICT_KEY[result.verdict])}
          </p>
        </div>
      )}
      <p className={P}>{t('verify.evidence.shell')}</p>
      <CurlLine command={evidenceShellLine(FUNCTIONS_BASE, wallet.trim() || '<wallet>', claim.trim() || '<claim>')} />
      <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.evidence.shellNote')}</p>
    </VerifySection>
  );
}
