import { ArrowDownToLine, ArrowUpFromLine, Ban, Check, Clock, FileUp, Flag, Hand, Lock, Repeat, Undo2, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ExplorerAnchor, Fold, LINK, SECTION_TITLE, ShortWallet } from '@/components/bounty/bountyUi';
import { CARD, FOCUS } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import { formatWhen, safeHttpsUrl } from '@/utils/bounty';
import { eventLabel, signerCaptionKey } from '@/utils/bountyJudge';
import type { CheckReport, JudgeInfo, LedgerEvent } from '@/types/bounty';

const MONEY_KINDS: readonly string[] = ['funded', 'paid', 'refunded'];
const KNOWN_KINDS: readonly string[] = ['created', 'funded', 'accepted', 'submitted', 'approved', 'rejected', 'withdrawn', 'expired', 'paid', 'refund_started', 'refunded', 'escrow_moved'];
/** Labels too long for a row: the row shows a short name and the sentence stays one tap away. */
const SHORT_NAME: Record<string, string> = {
  'bounty.event.approvedByCheck': 'bounty.event.short.autoCheck',
  'bounty.event.approvedByCheckNoCount': 'bounty.event.short.autoCheck',
  'bounty.event.escrow_moved': 'bounty.event.short.escrow_moved',
};
const ICON: Record<string, LucideIcon> = {
  created: Flag,
  funded: Lock,
  accepted: Hand,
  submitted: FileUp,
  approved: Check,
  rejected: X,
  withdrawn: Undo2,
  expired: Clock,
  paid: ArrowUpFromLine,
  refund_started: ArrowDownToLine,
  refunded: ArrowDownToLine,
  escrow_moved: Repeat,
};

/** Who stands behind a step: the wallet that signed it on chain, or Itera's own record when it has no transaction. */
function signedLine(event: LedgerEvent): { key: string; wallet?: string } | null {
  if (!event.signature) return MONEY_KINDS.includes(event.kind) ? null : { key: 'bounty.ledger.offchain' };
  if (!event.signedBy && MONEY_KINDS.includes(event.kind)) return { key: 'bounty.ledger.signerOnChain' };
  if (event.signedBy) return { key: signerCaptionKey(event), wallet: event.signedBy };
  return event.kind === 'accepted' ? { key: 'bounty.ledger.signedIteraOld' } : null;
}

const shortWhen = (iso: string, locale: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

export function Ledger({ events, judge = null, report = null }: { events: LedgerEvent[]; judge?: JudgeInfo | null; report?: CheckReport | null }) {
  const { t, locale } = useI18n();
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="bounty-ledger" data-testid="bounty-ledger">
      <h2 id="bounty-ledger" className={SECTION_TITLE}>{t('bounty.ledger.title')}</h2>
      {events.length === 0 ? (
        <p className="[font:500_14px_Inter] text-[#A0978A]">{t('bounty.ledger.empty')}</p>
      ) : (
        <ol className="flex flex-col">
          {events.map((event, index) => {
            const money = MONEY_KINDS.includes(event.kind);
            const known = KNOWN_KINDS.includes(event.kind);
            const named = eventLabel(event.kind, judge, report);
            const label = known ? t(named.key, named.vars) : event.kind;
            const shortKey = SHORT_NAME[named.key];
            const name = known && shortKey ? t(shortKey) : label;
            const signed = named.serverRecord ? null : signedLine(event);
            const onChain = Boolean(event.signature);
            const Icon = ICON[event.kind] ?? Ban;
            const link = safeHttpsUrl(event.explorerUrl);
            return (
              <li key={`${event.kind}-${event.at ?? index}-${index}`} className="relative flex gap-2.5" data-testid="bounty-event" data-kind={event.kind} data-chain={onChain}>
                <span aria-hidden className="relative flex w-7 shrink-0 justify-center">
                  {index < events.length - 1 && <span className="absolute left-1/2 top-9 h-[calc(100%-28px)] w-px -translate-x-1/2 bg-[#262320]" />}
                  <span className={`mt-2 grid h-7 w-7 place-items-center rounded-full border ${money ? 'border-[#3FD17F] bg-[#3FD17F]/15 text-[#3FD17F]' : 'border-[#3A352F] bg-[#141210] text-[#A0978A]'}`}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </span>
                </span>
                <details className="group/step min-w-0 flex-1">
                  <summary className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-0 rounded py-1 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                    <span className={`min-w-0 ${money ? "[font:700_19px/1.15_'Barlow_Condensed'] text-[#3FD17F]" : '[font:700_14px/1.25_Inter] text-[#F4EDE2]'}`} data-testid="bounty-event-name">{name}</span>
                    {event.sol && <span className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]">{event.sol}</span>}
                    {!onChain && <span className="rounded-full border border-[#2E2A25] px-1.5 py-0.5 [font:600_9px/1_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]" data-testid="bounty-event-server">{t('bounty.ledger.serverTag')}</span>}
                    {event.at && (
                      <time dateTime={event.at} title={formatWhen(event.at, locale)} className="ml-auto shrink-0 [font:500_11px_JetBrains_Mono] text-[#A0978A]">
                        {shortWhen(event.at, locale)}
                      </time>
                    )}
                  </summary>
                  <div className="flex flex-col gap-1 pb-3">
                    {name !== label && <p className="[font:400_13px/1.45_Inter] text-[#C9BFB0]" data-testid="bounty-event-label">{label}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {event.wallet && <ShortWallet address={event.wallet} />}
                      {event.at && <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{formatWhen(event.at, locale)}</span>}
                      <ExplorerAnchor href={event.explorerUrl} label={t('bounty.ledger.explorer')} />
                    </div>
                    {signed && (
                      <p className="[font:400_12px/1.4_Inter] text-[#A0978A]" data-testid="bounty-event-signer" data-signer={signed.key.split('.').pop()}>
                        {t(signed.key, signed.wallet ? { wallet: shortAddress(signed.wallet) } : undefined)}
                      </p>
                    )}
                  </div>
                </details>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" aria-label={t('bounty.ledger.explorer')} title={t('bounty.ledger.explorer')} className={`grid h-11 w-9 shrink-0 place-items-center rounded [font:700_15px_JetBrains_Mono] text-[#3FD17F] hover:text-[#5BE095] ${FOCUS}`} data-testid="bounty-event-link">
                    ↗
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Fold
        label={t('bounty.fold.how')}
        testId="bounty-ledger-how"
        aside={
          <Link to="/verify#trust" className={LINK}>
            {t('verify.link')} →
          </Link>
        }
      >
        <p>{t('bounty.ledger.plain')}</p>
        <p>{t('bounty.ledger.tapHint')}</p>
      </Fold>
    </section>
  );
}
