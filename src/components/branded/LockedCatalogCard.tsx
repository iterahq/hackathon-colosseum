/**
 * A catalog program rendered LOCKED for a visitor (a signed-in user with no
 * active subscription, `useAccessLevel() === 'visitor'`). Shared by HomePage's
 * visitor section and CatalogPage's visitor mode so the "browse locked" look —
 * lock badge, counts visible, CTA to /subscribe — is defined once.
 *
 * Deliberately does NOT call `useEnroll` — a visitor's card can never trigger
 * enrollment; the only action is the CTA link to /subscribe.
 */
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { CatalogProgramCard } from './CatalogProgramCard';
import { useI18n } from '@/i18n';
import { WebOnly } from '@/components/shell/WebOnly';
import type { CatalogProgram } from '@/types/catalog';

export function LockedCatalogCard({ program }: { program: CatalogProgram }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const action = (
    <div className="space-y-2" data-testid="locked-catalog-card">
      <WebOnly>
        <Link
          to="/subscribe"
          data-testid="catalog-locked-cta"
          className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
        >
          <Lock className="w-4 h-4" /> {t('catalog.locked.cta')} <ArrowRight className="w-4 h-4" />
        </Link>
      </WebOnly>
    </div>
  );

  return (
    <CatalogProgramCard
      program={program}
      locked
      onOpenThumbnail={() => navigate(`/program/${program.slug}`)}
      action={action}
    />
  );
}
