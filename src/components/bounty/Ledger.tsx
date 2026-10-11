import { Link } from 'react-router-dom';
import { ExplorerAnchor, LINK, SECTION_TITLE, ShortWallet } from '@/components/bounty/bountyUi';
import { CARD } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { formatWhen } from '@/utils/bounty';
import { eventLabel, signerCaptionKey } from '@/utils/bountyJudge';
import type { CheckReport, JudgeInfo, LedgerEvent } from '@/types/bounty';

const MONEY_KINDS: readonly string[] = ['funded', 'paid', 'refunded'];
const KNOWN_KINDS: readonly string[] = ['created', 'funded', 'accepted', 'submitted', 'approved', 'rejected', 'withdrawn', 'expired', 'paid', 'refund_started', 'refunded', 'escrow_moved'];

/** Who stands behind a step: the wallet that signed it on chain, or Itera's own record when it has no transaction. */
function signedLine(event: LedgerEvent): { key: string; wallet?: string } | null {
  if (!event.signature) return MONEY_KINDS.includes(event.kind) ? null : { key: 'bounty.ledger.offchain' };
  if (!event.signedBy && MONEY_KINDS.includes(event.kind)) return { key: 'bounty.ledger.signerOnChain' };
  if (event.signedBy) return { key: signerCaptionKey(event), wallet: event.signedBy };
  return event.kind === 'accepted' ? { key: 'bounty.ledger.signedIteraOld' } : null;
}

export function Ledger({ events, judge = null, report = null }: { events: LedgerEvent[]; judge?: JudgeInfo | null; report?: CheckReport | null }) {
  const { t, locale } = useI18n();
  return (
    <section className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="bounty-ledger" data-testid="bounty-ledger">
      <div className="flex flex-col gap-1">
        <h2 id="bounty-ledger" className={SECTION_TITLE}>{t('bounty.ledger.title')}</h2>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t('bounty.ledger.plain')}</p>
        <Link to="/verify#trust" className={LINK}>
          {t('verify.link')} →
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="[font:500_14px_Inter] text-[#A0978A]">{t('bounty.ledger.empty')}</p>
      ) : (
        <ol className="flex flex-col">
          {events.map((event, index) => {
            const money = MONEY_KINDS.includes(event.kind);
            const named = eventLabel(event.kind, judge, report);
            const label = KNOWN_KINDS.includes(event.kind) ? t(named.key, named.vars) : event.kind;
            const signed = named.serverRecord ? null : signedLine(event);
            return (
              <li key={`${event.kind}-${event.at ?? index}-${index}`} className="relative flex gap-3 pb-4 last:pb-0" data-testid="bounty-event" data-kind={event.kind}>
                <span aria-hidden className="relative flex w-4 shrink-0 justify-center">
                  {index < events.length - 1 && <span className="absolute left-1/2 top-4 h-full w-px -translate-x-1/2 bg-[#262320]" />}
                  <span className={`mt-1 h-3 w-3 rounded-full border-2 ${money ? 'border-[#3FD17F] bg-[#3FD17F]' : 'border-[#5E574E] bg-[#141210]'}`} />
                </span>
                <div className={`flex min-w-0 flex-1 flex-col gap-1 ${money ? 'rounded-[10px] border border-[#3FD17F]/50 bg-[#3FD17F]/5 px-3 py-2.5' : ''}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className={`${money ? "[font:700_20px_'Barlow_Condensed'] text-[#3FD17F]" : '[font:700_15px_Inter] text-[#F4EDE2]'}`}>{label}</span>
                    {event.sol && <span className="[font:700_14px_JetBrains_Mono] text-[#F4EDE2]">{event.sol}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {event.wallet && <ShortWallet address={event.wallet} />}
                    {event.at && (
                      <time dateTime={event.at} className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">
                        {formatWhen(event.at, locale)}
                      </time>
                    )}
                    <ExplorerAnchor href={event.explorerUrl} label={t('bounty.ledger.explorer')} />
                  </div>
                  {signed && (
                    <p className="[font:400_12px/1.4_Inter] text-[#A0978A]" data-testid="bounty-event-signer" data-signer={signed.key.split('.').pop()}>
                      {t(signed.key, signed.wallet ? { wallet: shortAddress(signed.wallet) } : undefined)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
