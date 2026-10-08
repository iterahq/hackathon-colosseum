import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * A page opened by a link starts at its top: the document is one scroller shared by every route, so it
 * would keep the offset of the page the learner came from. Going BACK keeps what the browser restores.
 * Renders nothing; mounted once, inside the router.
 */
export function RouteScrollReset() {
  const { pathname } = useLocation();
  const type = useNavigationType();

  const shown = useRef(pathname);

  useLayoutEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (type !== 'POP') window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, type]);

  return null;
}
