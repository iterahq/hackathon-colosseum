/**
 * One catalog course rendered with the shared rich {@link ProgramCard} for a
 * MEMBER (has paid access) — Enroll / Open CTA + inline error live in the
 * card's `footer` slot. An already-enrolled card also makes the hero
 * clickable so it opens the course directly (parity with HomePage).
 *
 * A VISITOR (no active subscription) never renders this component —
 * CatalogPage swaps it for `LockedCatalogCard`, which has no enroll affordance
 * at all, so `useEnroll` is never even mounted for a visitor.
 */
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { CatalogProgramCard } from '@/components/branded';
import { useEnroll } from '@/hooks/useCatalog';
import { useI18n } from '@/i18n';
import type { CatalogProgram } from '@/types/catalog';

export function CatalogCard({ program }: { program: CatalogProgram }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const enroll = useEnroll();

  const goToCourse = () => navigate(`/program/${program.slug}`);

  const onEnroll = async () => {
    try {
      await enroll.mutateAsync(program.id);
      // On success the user holds a membership; open the course straight away.
      goToCourse();
    } catch {
      /* error surfaced inline below via enroll.isError */
    }
  };

  const action = (
    <div data-program-slug={program.slug} data-testid="catalog-card" className="space-y-3">
      {program.alreadyEnrolled ? (
        <button
          type="button"
          onClick={goToCourse}
          data-testid="catalog-open"
          className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full border border-evergreen/40 bg-evergreen-soft text-evergreen-hi font-medium hover:bg-evergreen-soft/70 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" /> {t('catalog.open')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onEnroll}
          disabled={enroll.isPending}
          data-testid="catalog-enroll"
          className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-50"
        >
          {enroll.isPending ? (
            t('catalog.enrolling')
          ) : (
            <>
              {t('catalog.enroll')} <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      )}

      {enroll.isError && (
        <p className="text-sm text-clay" data-testid="catalog-enroll-error">
          {t('catalog.enrollError')}
        </p>
      )}
    </div>
  );

  return (
    <CatalogProgramCard
      program={program}
      onOpenThumbnail={program.alreadyEnrolled ? goToCourse : undefined}
      action={action}
    />
  );
}
