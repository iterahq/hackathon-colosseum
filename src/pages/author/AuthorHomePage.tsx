/**
 * Author home (plan 20260706, Phase 4) — lists the author's tenant programs and
 * their units, each unit deep-linking into the per-unit review+comment canvas.
 * RLS-scoped: only the author's tenant programs are visible. Read-only.
 */
import { Link } from 'react-router-dom';
import { PencilRuler, FolderTree, ChevronRight } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';
import { useAuthorPrograms } from '@/hooks/useAuthorCanvas';
import type { I18nText } from '@/types/content';

export default function AuthorHomePage() {
  const { locale } = useI18n();
  const { data: programs, isPending, isError, refetch } = useAuthorPrograms();

  const pick = (b: I18nText | undefined) =>
    (b && (b[locale] || b.pt || b.en || Object.values(b).find(Boolean))) || '—';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-verde-floresta/60 border border-border flex items-center justify-center text-menta">
            <PencilRuler className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[13px] uppercase tracking-wider text-menta">Authoring</span>
            <h1
              className="font-display font-bold text-foreground leading-tight text-xl"
              data-testid="author-title"
            >
              Review canvas
            </h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Pick a unit to review its activities, leave comments, and publish. Content
          edits happen via the agent (itera-mcp) — this canvas is review + publish.
        </p>

        {isPending && <p className="text-sm text-muted-foreground">Loading programs…</p>}
        {isError && (
          <div className="text-sm text-muted-foreground">
            Could not load your programs.{' '}
            <button className="underline" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        )}

        {!isPending && !isError && (programs?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="author-empty">
            No programs available for your tenant.
          </p>
        )}

        <div className="flex flex-col gap-6" data-testid="author-programs">
          {(programs ?? []).map(({ program, units }) => (
            <section
              key={program.id}
              className="rounded-2xl border border-border bg-card/60 p-4 md:p-5"
              data-testid="author-program"
            >
              <div className="flex items-center gap-2 mb-3">
                <FolderTree className="w-4 h-4 text-menta" />
                <h2 className="text-sm font-semibold text-foreground">{pick(program.title)}</h2>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {units.length} unit{units.length === 1 ? '' : 's'}
                </span>
              </div>
              {units.length === 0 ? (
                <p className="text-xs text-muted-foreground">No units yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {units.map((u) => (
                    <li key={u.id}>
                      <Link
                        to={`/author/units/${u.id}/canvas`}
                        data-testid="author-unit-link"
                        className="group flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 hover:border-menta/50 transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                            {String(u.ordinal).padStart(2, '0')}
                          </span>
                          <span className="truncate text-sm text-foreground">{pick(u.title)}</span>
                          <span className="text-[11px] font-mono text-muted-foreground/70">
                            {u.lessonCount} lesson{u.lessonCount === 1 ? '' : 's'}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-menta" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
