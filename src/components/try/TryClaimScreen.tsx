import { Link } from 'react-router-dom';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { GUEST_LESSON_ID } from '@/consts/guestLesson';
import { useI18n } from '@/i18n';

/** While a fresh sign-in replays the visitor's passes, and when some of them did not land. */
export function TryClaimScreen({ state }: { state: 'saving' | 'failed' }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen place-items-center bg-[#0A0908] px-4 text-[#F4EDE2]" data-testid="try-claim" data-state={state}>
      {state === 'saving' ? (
        <TeraLoader fullScreen label={t('try.claim.saving')} />
      ) : (
        <TeraNote
          mood="oops"
          title={t('try.claim.failed')}
          action={
            <Link to={`/lesson/${GUEST_LESSON_ID}`} className={TERA_BUTTON} data-testid="try-claim-open">
              {t('try.claim.open')}
            </Link>
          }
        />
      )}
    </div>
  );
}
