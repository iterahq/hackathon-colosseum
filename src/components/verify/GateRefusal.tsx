import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeBlock } from '@/components/chain/RawParts';
import { ChainProof } from '@/components/chain/ChainProof';
import { P, RunButton, TextInput } from '@/components/verify/VerifyParts';
import { useI18n } from '@/i18n';
import { GateCheckError, askGate } from '@/services/gateCheck.service';
import type { GateCheck } from '@/types/gateCheck';
import { gateHeadline, gateReason, gateTried, programLines } from '@/utils/gateCheck';

type Busy = 'send' | 'ask' | null;

/**
 * The escrow program asked to accept a wallet, where a visitor can watch it answer: a real transaction it
 * fails on chain, or a dry run for any address. The text of each answer is the program's own error.
 */
export function GateRefusal() {
  const { t, locale } = useI18n();
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<GateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'send' | 'ask') => {
    setBusy(kind);
    setError(null);
    try {
      setResult(await askGate(kind === 'send' ? { send: true, lang: locale } : { wallet: wallet.trim(), lang: locale }));
    } catch (failure) {
      const code = failure instanceof GateCheckError ? failure.code : '';
      const known = ['rate_limited', 'invalid_address', 'no_gated_bounty_open', 'upstream_unavailable'].includes(code);
      setError(t(known ? `verify.gate.try.error.${code}` : 'verify.gate.try.error'));
      setResult(null);
    } finally {
      setBusy(null);
    }
  };

  const reason = result ? gateReason(t, result) : null;
  const refused = result?.verdict?.refused === true;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#2E2A25] bg-[#141210] p-4" data-testid="gate-refusal">
      <h3 className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('verify.gate.try.title')}</h3>
      <p className={P}>{t('verify.gate.try.intro')}</p>
      <RunButton label={t('verify.gate.try.send')} busyLabel={t('verify.gate.try.sending')} busy={busy === 'send'} disabled={busy !== null} onClick={() => void run('send')} />
      <TextInput label={t('verify.gate.try.walletLabel')} value={wallet} onChange={setWallet} />
      <RunButton label={t('verify.gate.try.ask')} busyLabel={t('verify.gate.try.asking')} busy={busy === 'ask'} disabled={busy !== null || wallet.trim() === ''} onClick={() => void run('ask')} />
      {error && (
        <p role="alert" className="[font:500_14px_Inter] text-[#E0655A]" data-testid="gate-refusal-error">
          {error}
        </p>
      )}
      {result && (
        <div className="flex min-w-0 flex-col gap-2" role="status" data-testid="gate-refusal-result" data-mode={result.mode} data-refused={String(refused)} data-error={result.verdict?.errorName ?? ''}>
          <p className={`[font:700_15px/1.45_Inter] ${refused ? 'text-[#F2C66D]' : 'text-[#3FD17F]'}`}>{gateHeadline(t, result)}</p>
          {reason && <p className={P}>{reason}</p>}
          <p className={P}>
            {gateTried(t, result)}{' '}
            <Link to={`/bounties/${result.bounty.slug}`} className="underline">
              {t('verify.gate.try.openBounty')}
            </Link>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={P}>{t('verify.gate.try.certLink')}</span>
            <ChainProof kind="address" value={result.certification.address} />
          </div>
          {result.signature && (
            <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="gate-refusal-tx">
              <span className={P}>{t('verify.gate.try.openTx')}</span>
              <ChainProof kind="tx" value={result.signature} />
            </div>
          )}
          {result.logs.length > 0 && <CodeBlock label={t('verify.gate.try.logLabel')}>{programLines(result.logs)}</CodeBlock>}
          {result.repeatWith && (
            <>
              <span className="[font:500_12px/1.5_Inter] text-[#A0978A]">{t('verify.gate.try.repeatLabel')}</span>
              <CodeBlock label={t('verify.gate.try.repeatLabel')}>{result.repeatWith}</CodeBlock>
            </>
          )}
        </div>
      )}
    </div>
  );
}
