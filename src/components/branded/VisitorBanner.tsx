/**
 * Visitor mode (2026-09-18) — the `aside` slot of the universal home screen
 * (`HomeRoute`), where a member has the welcome panel, for a signed-in user with no active subscription: title + one line +
 * CTA to /subscribe. Replaces stats the user has none of yet.
 */
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useShellSurface } from '@/hooks/useShellSurface';

export function VisitorBanner() {
  const { t } = useI18n();
  if (useShellSurface() !== 'web') return null;
  return (
    <div
      className="rounded-3xl border border-evergreen/30 bg-evergreen-soft/20 p-6 md:p-8 flex flex-1 flex-col justify-center gap-3"
      data-testid="visitor-banner"
    >
      <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider bg-obsidiana/70 text-evergreen-hi border border-evergreen/30">
        <Lock className="w-3 h-3" /> {t('role.visitor')}
      </span>
      <h2 className="font-display font-semibold text-foreground text-lg">
        {t('home.visitor.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('home.visitor.body')}</p>
      <Link
        to="/subscribe"
        data-testid="visitor-banner-cta"
        className="mt-1 inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors w-fit"
      >
        {t('subscribe.cta')}
      </Link>
    </div>
  );
}
