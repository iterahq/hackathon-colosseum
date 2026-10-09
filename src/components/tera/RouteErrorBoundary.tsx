import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { TERA_BUTTON, TeraNote } from './TeraNote';

interface BoundaryProps {
  resetKey: string;
  fallback: (retry: () => void) => ReactNode;
  children: ReactNode;
}

class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[route] render failed:', error.message, info.componentStack);
  }
  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}

/** A render error in any route ends in Tera and a retry instead of a blank page; navigating away clears it. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <Boundary
      resetKey={pathname}
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
