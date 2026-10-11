import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeBlock } from '@/components/chain/RawParts';
import { ChainProof } from '@/components/chain/ChainProof';
import { P, RunButton } from '@/components/verify/VerifyParts';
import { useI18n } from '@/i18n';
import { GateCheckError, askGate } from '@/services/gateCheck.service';
import type { GateCheck } from '@/types/gateCheck';
import { programLines } from '@/utils/gateCheck';

/**
 * The escrow program refusing a wallet that was not invited to a direct bounty: the question goes to the program for
 * an open direct bounty, as a wallet that is not the invitee. A dry run on the node, and the program's own error.
 */
export function DirectGateRefusal() {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await askGate({ direct: true, lang: locale }));
    } catch (failure) {
      const code = failure instanceof GateCheckError ? failure.code : '';
      setError(t(['rate_limited', 'no_direct_bounty_open', 'upstream_unavailable'].includes(code) ? `verify.gate.direct.error.${code}` : 'verify.gate.try.error'));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const verdict = result?.verdict ?? null;
  const refused = verdict?.refused === true;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#2E2A25] bg-[#141210] p-4" data-testid="gate-direct-refusal">
      <h3 className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('verify.gate.direct.title')}</h3>
      <p className={P}>{t('verify.gate.direct.intro')}</p>
      <RunButton label={t('verify.gate.direct.ask')} busyLabel={t('verify.gate.try.asking')} busy={busy} disabled={busy} onClick={() => void run()} />
      {error && (
        <p role="alert" className="[font:500_14px_Inter] text-[#E0655A]" data-testid="gate-direct-error">
          {error}
        </p>
      )}
      {result && result.direct && (
        <div className="flex min-w-0 flex-col gap-2" role="status" data-testid="gate-direct-result" data-refused={String(refused)} data-error={verdict?.errorName ?? ''}>
          <p className={`[font:700_15px/1.45_Inter] ${refused ? 'text-[#F2C66D]' : 'text-[#E0655A]'}`}>
            {refused && verdict?.errorName ? t('verify.gate.try.refused', { name: verdict.errorName, hex: verdict.errorHex ?? '' }) : t('verify.gate.direct.notRefused')}
          </p>
          {refused && verdict?.errorName === 'not_invited' && <p className={P}>{t('verify.gate.direct.reason')}</p>}
          <p className={P}>{t('verify.gate.direct.tried', { bounty: result.bounty.title })}</p>
          {result.direct.teamTest && <p className={P} data-testid="gate-direct-team">{t('verify.gate.direct.team')}</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={P}>{t('verify.gate.direct.invitee')}</span>
            <ChainProof kind="address" value={result.direct.invitee} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={P}>{t('verify.gate.direct.claimant')}</span>
            <ChainProof kind="address" value={result.claimant.address} />
          </div>
          <Link to={`/bounties/${result.bounty.slug}`} className={`${P} underline`}>
            {t('verify.gate.try.openBounty')}
          </Link>
          {result.logs.length > 0 && <CodeBlock label={t('verify.gate.try.logLabel')}>{programLines(result.logs)}</CodeBlock>}
          {result.repeatWith && <CodeBlock label={t('verify.gate.try.repeatLabel')}>{result.repeatWith}</CodeBlock>}
        </div>
      )}
    </div>
  );
}
