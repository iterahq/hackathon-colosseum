import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { TERA_BUTTON, TeraNote } from '@/components/tera/TeraNote';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';
import { loadedEntryScript, shouldReloadForNewBuild } from '@/lib/buildFreshness';

/**
 * Not-found page: Tera looked everywhere. The 404 line stays in the console, where monitoring reads it.
 * A tab opened before a deploy does not know the routes that deploy added: before saying "not found" it
 * asks the server for the current build and reloads once when that build is newer, showing the loader meanwhile.
 */
export default function NotFoundRoute({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const [checking, setChecking] = useState(() => loadedEntryScript() !== null);
  usePageTitle(checking ? null : t('tera.notFound.pageTitle'));
  useEffect(() => {
    if (!checking) return;
    let alive = true;
    void shouldReloadForNewBuild(pathname).then((stale) => {
      if (!alive) return;
      if (stale) reload();
      else setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, [checking, pathname, reload]);
  useEffect(() => {
    if (!checking) console.error('404 Error: User attempted to access non-existent route:', pathname);
  }, [checking, pathname]);
  if (checking) return <TeraLoader fullScreen delayed />;
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
