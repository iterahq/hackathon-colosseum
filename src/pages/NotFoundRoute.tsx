import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';

/** Not-found page: Tera looked everywhere. The 404 line stays in the console, where monitoring reads it. */
export default function NotFoundRoute() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  usePageTitle(t('tera.notFound.pageTitle'));
  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', pathname);
  }, [pathname]);
  return (
    <div className="grid min-h-screen place-items-center bg-[#0A0908] px-4 text-[#F4EDE2]" data-testid="not-found">
      <TeraNote
        mood="oops"
        title={t('tera.notFound.title')}
        body={t('tera.notFound.body')}
        action={
          <Link to="/" className={TERA_BUTTON}>
            {t('tera.notFound.cta')}
          </Link>
        }
      />
    </div>
  );
}
