/**
 * Locked program preview for a VISITOR (signed-in, no active subscription)
 * landing on `/program/:slug` for a program that IS in the catalog. Renders
 * the program header (title, unit/lesson/activity counts) with a locked state
 * and a CTA to /subscribe — instead of `ProgramUnavailable`.
 *
 * `useProgramOutline` is the seam for a future unit/lesson TITLE list (see
 * that hook's header); it resolves to `null` today, so only the aggregate
 * counts already returned by `itera.catalog_programs()` are shown.
 */
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { ProgramIcon } from './ProgramIcon';
import { useProgramOutline } from '@/hooks/useProgramOutline';
import { useI18n } from '@/i18n';
import { WebOnly } from '@/components/shell/WebOnly';
import type { CatalogProgram } from '@/types/catalog';

export function LockedProgramView({ program }: { program: CatalogProgram }) {
  const { t, tText } = useI18n();
  const outline = useProgramOutline(program.slug);

  return (
    <div data-testid="program-locked" className="space-y-6">
      <div className="relative rounded-3xl overflow-hidden border border-border bg-obsidiana p-6 md:p-8">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <div className="relative flex items-center gap-5">
          <ProgramIcon icon={program.icon} size="lg" />
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> {t('label.program')}
            </span>
            <h1 className="font-display font-bold text-foreground mt-1">{tText(program.title)}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {program.unitCount} {t('label.units').toLowerCase()} · {program.lessonCount}{' '}
              {t('label.lessons').toLowerCase()} · {program.activityCount}{' '}
              {t('label.activities').toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      <div
        className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center flex flex-col items-center gap-3"
        data-testid="program-locked-cta-card"
      >
        <div className="w-11 h-11 rounded-2xl bg-muted/40 border border-border flex items-center justify-center text-muted-foreground">
          <Lock className="w-5 h-5" />
        </div>
        <WebOnly>
          <p className="text-sm text-muted-foreground max-w-[46ch]">{t('program.locked.hint')}</p>
          <Link
            to="/subscribe"
            data-testid="program-locked-subscribe"
            className="h-10 px-5 inline-flex items-center rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors mt-1"
          >
            {t('catalog.locked.cta')}
          </Link>
        </WebOnly>
        {/* `outline` is always null today — see useProgramOutline. Once a real
            RPC backs it, render the unit/lesson titles here. */}
        {outline && outline.length > 0 && (
          <ul className="text-left w-full mt-2" data-testid="program-locked-outline">
            {outline.map((unit) => (
              <li key={unit.id} className="text-sm text-foreground">
                {unit.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
