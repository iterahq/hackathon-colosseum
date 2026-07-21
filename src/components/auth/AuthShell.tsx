import type { ReactNode } from 'react';
import { useTenantBranding } from '@/auth/useTenantBranding';
import { useI18n } from '@/i18n';
import { Logo } from '@/components/branded';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  testId: string;
  children: ReactNode;
}

/** Shared chrome for the auth surfaces (login / forgot / reset): tenant-branded
 * backdrop + card + logo header + locale toggle. */
export function AuthShell({ title, subtitle, testId, children }: AuthShellProps) {
  const { branding } = useTenantBranding();
  const { t, toggleLocale } = useI18n();

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden"
      style={
        branding.loginBg
          ? { backgroundImage: `url(${branding.loginBg})`, backgroundSize: 'cover' }
          : undefined
      }
      data-testid={testId}
    >
      {!branding.loginBg && <div className="absolute inset-0 grid-pattern opacity-30" />}
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-8">
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
          className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          data-testid="locale-toggle"
        >
          {t('locale.switch')}
        </button>
      </div>
    </div>
  );
}
