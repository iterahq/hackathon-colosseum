import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { TERA_BUTTON, TeraNote } from './TeraNote';

interface BoundaryProps {
  resetKey: string;
  fallback: (retry: () => void) => ReactNode;
  reload: () => void;
  children: ReactNode;
}

const STALE_CHUNK_RELOADED_KEY = 'itera.route.staleChunkReloaded';

/**
 * A deploy between two navigations leaves the open tab asking for chunks that no
 * longer exist: the import rejects (404) or resolves to a module without `default`.
 * Retrying the render cannot help; only a fresh index.html can.
 */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \S+ failed|reading 'default'/i.test(
    message,
  );
}

function reloadOnceForStaleChunk(error: Error, resetKey: string, reload: () => void): boolean {
  if (!isStaleChunkError(error)) return false;
  let already = false;
  try {
    already = sessionStorage.getItem(STALE_CHUNK_RELOADED_KEY) === resetKey;
    if (!already) sessionStorage.setItem(STALE_CHUNK_RELOADED_KEY, resetKey);
  } catch {
    already = false;
  }
  if (already) return false;
  reload();
  return true;
}

class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[route] render failed:', error.message, info.componentStack);
    reloadOnceForStaleChunk(error, this.props.resetKey, this.props.reload);
  }
  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}

/** A render error in any route ends in Tera and a retry instead of a blank page; navigating away clears it. */
export function RouteErrorBoundary({
  children,
  reload = () => window.location.reload(),
}: {
  children: ReactNode;
  reload?: () => void;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <Boundary
      resetKey={pathname}
      reload={reload}
      fallback={(retry) => (
        <div className="grid min-h-screen place-items-center bg-[#0A0908] px-4 text-[#F4EDE2]" data-testid="route-error">
          <TeraNote
            mood="oops"
            title={t('tera.error.title')}
            action={
              <button type="button" onClick={retry} className={TERA_BUTTON}>
                {t('tera.error.retry')}
              </button>
            }
          />
        </div>
      )}
    >
      {children}
    </Boundary>
  );
}
