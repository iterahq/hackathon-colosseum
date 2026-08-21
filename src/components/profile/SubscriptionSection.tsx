import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useEntitlement } from '@/hooks/useEntitlement';
import { formatBillingDate } from '@/utils/formatBillingDate';

export function SubscriptionSection() {
  const { t, locale } = useI18n();
  const { data, isPending, isError, refetch } = useEntitlement();

  const exempt = data?.status === 'exempt';
  const endsAt = formatBillingDate(data?.currentPeriodEnd, locale);

  return (
    <section
      className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-8"
      data-testid="subscription-section"
    >
      <h2 className="font-display text-xl text-foreground">{t('subscription.section')}</h2>

      {isPending && (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="subscription-loading">
          {t('common.loading')}
        </p>
      )}

      {isError && (
        <div className="mt-4" data-testid="subscription-error">
          <p className="text-sm text-destructive">{t('subscription.loadError')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 h-10 rounded-full border border-border px-4 text-sm transition-colors hover:border-clay/60"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {!isPending && !isError && data && (
        <div className="mt-4">
          <span
            data-testid="subscription-status"
            data-active={data.active ? 'true' : 'false'}
            className={`inline-flex h-6 items-center rounded-full border px-2.5 font-mono text-[11px] uppercase tracking-wider ${
              data.active
                ? 'border-evergreen/30 bg-evergreen-soft text-evergreen-hi'
                : 'border-border bg-muted text-muted-foreground'
            }`}
          >
            {t(
              exempt
                ? 'subscription.status.exempt'
                : data.active
                  ? 'subscription.status.active'
                  : 'subscription.status.inactive',
            )}
          </span>

          <p className="mt-3 text-sm text-muted-foreground" data-testid="subscription-detail">
            {exempt
              ? t('subscription.exemptHint')
              : !data.active
                ? t('subscription.inactiveHint')
                : endsAt
                  ? t(
                      data.cancelAtPeriodEnd ? 'subscription.endsOn' : 'subscription.renewsOn',
                    ).replace('{date}', endsAt)
                  : t('subscription.activeHint')}
          </p>

          {data.active && !exempt && data.seatCount !== null && (
            <p className="mt-1.5 text-sm text-muted-foreground" data-testid="subscription-seats">
              {t('subscription.seats').replace('{count}', String(data.seatCount))}
            </p>
          )}

          {!data.active && (
            <Link
              to="/subscribe"
              data-testid="subscription-cta"
              className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-evergreen px-6 font-medium text-obsidiana transition-colors hover:bg-evergreen-hi"
            >
              <CreditCard className="h-4 w-4" />
              {t('subscribe.cta')}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
