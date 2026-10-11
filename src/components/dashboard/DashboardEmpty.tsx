import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { useI18n } from '@/i18n';

interface Props {
  kind: 'empty' | 'error';
  onAction: () => void;
  /** What the button says instead of the default of its kind. */
  actionLabel?: string;
}

/** The dashboard with nothing to show: Tera, one line, the way forward. */
export function DashboardEmpty({ kind, onAction, actionLabel }: Props) {
  const { t } = useI18n();
  const error = kind === 'error';
  return (
    <section className="rounded-[14px] border border-dashed border-[#2E2A25] bg-[#141210] px-6 pb-8" data-testid={error ? 'dashboard-error' : 'dashboard-empty'}>
      <TeraNote
        mood={error ? 'oops' : 'neutral'}
        title={error ? t('dash.error') : t('dash.empty.title')}
        action={
          <button type="button" onClick={onAction} className={TERA_BUTTON}>
            {actionLabel ?? (error ? t('dash.retry') : t('dash.empty.cta'))}
          </button>
        }
      />
    </section>
  );
}
