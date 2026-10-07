import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { formatPageTitle, pageName, pageTitleKey } from '@/lib/pageTitle';

/** Keeps `document.title` on the page being shown. Renders nothing; mounted once, inside the router. */
export function PageTitle() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const [served] = useState(() => document.title);
  const named = useSyncExternalStore(pageName.subscribe, pageName.get, pageName.get);
  const key = pageTitleKey(pathname);
  const title = formatPageTitle(named ?? (key === null ? null : t(key)), served);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}
