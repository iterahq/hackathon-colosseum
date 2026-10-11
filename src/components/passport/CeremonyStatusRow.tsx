import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChainProof } from '@/components/chain/ChainProof';
import { useI18n } from '@/i18n';
import { chainUrl } from '@/lib/explorer';
import { getSentStampSignature } from '@/services/achievements.service';
import type { CeremonyStatus } from '@/types/achievements';
import type { CeremonyMedal } from '@/utils/ceremony';
import { MedalArt } from './MedalArt';

interface Props {
  status: CeremonyStatus;
  txSignature: string | null;
  assetAddress: string | null;
  medals: CeremonyMedal[];
  /** Name of the trail whose certification just turned gold; null when it did not. */
  goldTrail?: string | null;
  accent: string;
  accentDark: string;
  locked: boolean;
  onRetry?: () => void;
  onLater?: () => void;
  onConnect?: () => void;
}

const BTN =
  "inline-flex h-11 items-center justify-center rounded-xl border-0 border-b-[4px] px-5 [font:700_20px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-[3px] active:border-b-[1px] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]";
const PRIMARY = `${BTN} border-b-[#1F8A4F] bg-[#3FD17F] text-[#0A0908]`;
const GHOST = `${BTN} border-b-[#262320] bg-[#1C1916] text-[#F4EDE2]`;

function Spinner() {
  const reduce = useReducedMotion();
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className={reduce ? '' : 'animate-spin'} style={{ animationDuration: '1s', animationTimingFunction: 'linear' }}>
      <circle cx="11" cy="11" r="9" fill="none" stroke="#3FD17F" strokeWidth="2.5" strokeDasharray="5 4" />
    </svg>
  );
}

const SENT_POLL_MS = 1200;

/** While the stamp is being written: the signature of the transaction as soon as the server has sent it. */
function useSentSignature(waiting: boolean): string | null {
  const [signature, setSignature] = useState<string | null>(null);
  useEffect(() => {
    if (!waiting || signature) return;
    let alive = true;
    const read = () => void getSentStampSignature().then((found) => alive && found && setSignature(found), () => undefined);
    read();
    const id = window.setInterval(read, SENT_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [waiting, signature]);
  return waiting ? signature : null;
}

/** Under the page: what the chain is doing, and the one or two actions that fit that state. */
export function CeremonyStatusRow({ status, txSignature, assetAddress, medals, goldTrail = null, accent, accentDark, locked, onRetry, onLater, onConnect }: Props) {
  const { t, locale } = useI18n();
  const reduce = useReducedMotion();
  const href = chainUrl(txSignature, assetAddress);
  const sent = useSentSignature(status === 'minting');
  const sentHref = sent ? chainUrl(sent, null) : null;
  const line = 'text-center [font:600_16px/1.3_Inter]';
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
      className="flex flex-col items-center gap-3"
      data-testid="ceremony-status"
      data-status={status}
      role="status"
    >
      {status === 'minting' && (
        <>
          <span className={`${line} flex items-center gap-2`}>
            <Spinner />
            {t('passport.ceremony.minting')}
          </span>
          <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('passport.ceremony.mintingSub')}</span>
          {sentHref && (
            <a href={sentHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center [font:500_13px_JetBrains_Mono] text-[#3FD17F] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" data-testid="ceremony-sent-tx">
              {t('passport.ceremony.sent')}
            </a>
          )}
        </>
      )}
      {status === 'minted' && (
        <>
          <span className={`${line} text-[#3FD17F]`}>{t('passport.ceremony.minted')}</span>
          {href && (
            <>
              <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center [font:500_13px_JetBrains_Mono] text-[#3FD17F] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
                {t('passport.viewTx')}
              </a>
              <ChainProof kind={txSignature ? 'tx' : 'address'} value={txSignature ?? assetAddress ?? ''} raw={false} primary={false} className="justify-center" />
            </>
          )}
        </>
      )}
      {goldTrail && (
        <span className="flex items-center gap-2 text-center [font:700_14px_JetBrains_Mono] text-[#F2C66D]" data-testid="ceremony-gold">
          {t('passport.ceremony.gold', { trail: goldTrail })}
        </span>
      )}
      {medals.map((m) => (
        <span key={m.key} className="flex items-center gap-2.5 [font:700_14px_JetBrains_Mono] text-[#F2C66D]" data-testid="ceremony-medal">
          <MedalArt glyph={m.glyph} title={m.title} kind={m.kind} credentialId={m.credentialId} earned accent={accent} accentDark={accentDark} size={40} lang={locale} />
          {t('passport.ceremony.newMedal', { title: m.title })}
        </span>
      ))}
      {status === 'pending' && <span className={`${line} text-[#C9BFB0]`}>{t('passport.ceremony.pending')}</span>}
      {status === 'failed' && (
        <>
          <span className={`${line} text-[#E0A86F]`}>{t('passport.ceremony.failed')}</span>
          <span className="flex gap-3">
            <button type="button" className={PRIMARY} onClick={onRetry} disabled={locked}>
              {t('passport.ceremony.retry')}
            </button>
            <button type="button" className={GHOST} onClick={onLater}>
              {t('passport.ceremony.later')}
            </button>
          </span>
        </>
      )}
      {status === 'no_wallet' && (
        <>
          <span className={`${line} text-[#C9BFB0]`}>{t('passport.ceremony.noWallet')}</span>
          <span className="flex gap-3">
            <button type="button" className={PRIMARY} onClick={onConnect} disabled={locked}>
              {t('passport.connect')}
            </button>
            <button type="button" className={GHOST} onClick={onLater}>
              {t('passport.ceremony.later')}
            </button>
          </span>
        </>
      )}
    </motion.div>
  );
}
