import { Link } from 'react-router-dom';
import { WebOnly } from '@/components/shell/WebOnly';
import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { TRY_PATH } from '@/consts/guestLesson';
import { useI18n } from '@/i18n';

export const TRY_SECONDARY = `${TERA_BUTTON} border-b-[#262320] bg-[#141210] text-[#F4EDE2]`;

/** The end of the public first lesson: the score, what the server checked, and the two doors that keep it. */
export function TryDoneCard({ passed, total, serverChecked, onRedo }: { passed: number; total: number; serverChecked: number; onRedo: () => void }) {
  const { t } = useI18n();
  const next = encodeURIComponent(TRY_PATH);
  return (
    <TeraNote
      mood={passed === total ? 'happy' : 'neutral'}
      title={t('try.done.title', { n: passed, total })}
      body={`${t('try.done.server', { n: serverChecked })} ${t('try.done.gate')}`}
      data-testid="try-done"
      action={
        <div className="flex flex-col gap-3">
          <Link to={`/login?next=${next}`} className={TERA_BUTTON} data-testid="try-done-wallet">
            {t('try.done.wallet')}
          </Link>
          <WebOnly>
            <Link to={`/signup?next=${next}`} className={TRY_SECONDARY} data-testid="try-done-email">
              {t('try.done.email')}
            </Link>
          </WebOnly>
          {passed < total && (
            <button type="button" onClick={onRedo} className={TRY_SECONDARY} data-testid="try-done-redo">
              {t('try.done.redo')}
            </button>
          )}
        </div>
      }
    />
  );
}
