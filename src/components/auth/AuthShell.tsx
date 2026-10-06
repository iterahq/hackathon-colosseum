import type { ReactNode } from 'react';
import { useTenantBranding } from '@/auth/useTenantBranding';
import { useI18n } from '@/i18n';
import { Logo } from '@/components/branded/Logo';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  testId: string;
  children: ReactNode;
  /** Optional desktop-only (lg+) companion panel — e.g. what the subscription
   * includes on /signup. Hidden below lg; callers that want a mobile fallback
   * render it themselves inside `children`. */
  sidePanel?: ReactNode;
}

/** Shared chrome for the auth surfaces (login / forgot / reset): tenant-branded
 * backdrop + card + logo header + locale toggle. */
export function AuthShell({ title, subtitle, testId, children, sidePanel }: AuthShellProps) {
  const { branding } = useTenantBranding();
  const { t, toggleLocale } = useI18n();

  return (
    <div
      className="min-h-screen max-sm:min-h-svh max-sm:supports-[min-height:100dvh]:min-h-dvh flex items-center justify-center bg-background px-4 relative overflow-hidden"
      style={
        branding.loginBg
          ? { backgroundImage: `url(${branding.loginBg})`, backgroundSize: 'cover' }
          : undefined
      }
      data-testid={testId}
    >
      {!branding.loginBg && <div className="absolute inset-0 grid-pattern opacity-30" />}
      <div className={`relative flex w-full max-w-sm items-stretch gap-6 ${sidePanel ? 'lg:max-w-3xl' : ''}`}>
        <div className="auth-touch w-full rounded-3xl border border-border bg-card p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.name} className="h-10" data-testid="tenant-logo" />
            ) : (
              <div data-testid="brand-name">
                <Logo size={36} />
              </div>
            )}
            <h1 className="font-display text-xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          <button
            type="button"
            onClick={toggleLocale}
            className="mt-4 w-full text-center text-xs text-muted-foreground touch-hit underline-offset-2 hover:underline"
            data-testid="locale-toggle"
          >
            {t('locale.switch')}
          </button>
        </div>
        {sidePanel && (
          <div
            className="hidden w-full rounded-3xl border border-border bg-card p-8 lg:block"
            data-testid="auth-side-panel"
          >
            {sidePanel}
          </div>
        )}
      </div>
    </div>
  );
}
