/**
 * Program (course) detail in the dashboard's language: a hero with the course accent and progress, then
 * one trail card per unit with its days. The app header is the dashboard top bar.
 *
 * Visitor mode (2026-09-18): a signed-in user with no active subscription reaches this route too
 * (RequireSubscription mode="preview"). They hold no REAL tenant membership, so `useProgram` would always
 * resolve "not found" via RLS — skip that query for them and look the slug up in the membership-independent
 * catalog: on a match render a LOCKED preview instead of "no access".
 */
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { LockedProgramView } from '@/components/branded/LockedProgramView';
import { CoursesShell } from '@/components/courses/CoursesShell';
import { ProgramHero } from '@/components/courses/ProgramHero';
import { ProgramTrail } from '@/components/courses/ProgramTrail';
import { useTrailHighlight } from '@/components/courses/useTrailHighlight';
import { ProgramUnavailable } from '@/components/courses/ProgramUnavailable';
import { useProgram } from '@/hooks';
import { useCatalog } from '@/hooks/useCatalog';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { isProgramNotFoundError } from '@/services/programs.service';
import { useI18n } from '@/i18n';
import { usePageTitle } from '@/hooks/usePageTitle';
import { programTrails } from '@/utils/coursesProgram';

export default function ProgramPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, tText } = useI18n();

  const isVisitor = useAccessLevel().level === 'visitor';
  const { data: program, isPending, isError, error, refetch } = useProgram(isVisitor ? undefined : slug);
  const { data: catalogPrograms = [], isPending: catalogPending, isError: catalogError, refetch: refetchCatalog } = useCatalog({ enabled: isVisitor });
  const catalogMatch = isVisitor ? catalogPrograms.find((p) => p.slug === slug) : undefined;
  usePageTitle(tText(program?.title ?? catalogMatch?.title));
  const trails = useMemo(() => (program ? programTrails(program) : []), [program]);

  const highlighted = useTrailHighlight(trails.map((tr) => tr.id));

  // A missing route param can never resolve (the query stays disabled, so it is permanently pending):
  // treat it like a hidden program so the route never renders an eternal skeleton.
  const unavailable = !slug || (!isVisitor && isError && isProgramNotFoundError(error));
  const loading = Boolean(slug) && !unavailable && (isVisitor ? catalogPending : isPending);

  return (
    <CoursesShell>
      {loading ? (
        <div className="flex flex-col gap-5" data-testid="program-loading" aria-busy="true">
          <div className="h-[260px] animate-pulse rounded-[14px] bg-[#141210]" />
          {[0, 1].map((i) => (
            <div key={i} className="h-[200px] animate-pulse rounded-[14px] bg-[#141210]" />
          ))}
        </div>
      ) : isVisitor ? (
        catalogMatch ? (
          <LockedProgramView program={catalogMatch} />
        ) : (
          <ProgramUnavailable visitor onRetry={catalogError ? () => void refetchCatalog() : undefined} />
        )
      ) : unavailable ? (
        <ProgramUnavailable />
      ) : isError ? (
        <div className="flex flex-col items-start gap-4 rounded-[14px] border border-dashed border-[#2E2A25] bg-[#141210] p-8" data-testid="program-error">
          <p className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{`> ${t('program.notFound')}`}</p>
          <button
            onClick={() => refetch()}
            className="h-12 rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-1 active:border-b-[1px]"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : program ? (
        <>
          <ProgramHero program={program} trails={trails} />
          {trails.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#2E2A25] bg-[#141210] p-8 [font:500_13px_JetBrains_Mono] text-[#A0978A]" data-testid="program-empty">
              {`> ${t('courses.program.empty')}`}
            </div>
          ) : (
            <div className="flex flex-col gap-5" data-testid="skill-tree">
              {trails.map((trail, i) => (
                <ProgramTrail key={trail.id} trail={trail} number={i + 1} highlighted={highlighted === trail.id} />
              ))}
            </div>
          )}
        </>
      ) : (
        <ProgramUnavailable />
      )}
    </CoursesShell>
  );
}
