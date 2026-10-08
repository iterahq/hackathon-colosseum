/**
 * The catalog as the universal screen draws it: the rows of the backend as programs, each program shaped
 * for display, and the list state read off a query. Pure: each host (the web's `useCatalogScreen`, the
 * shell's `catalogHost`) gives it its own i18n lookups and the state of its own reads.
 */
import type { CatalogCardAction, CatalogCardView, CatalogListState } from '../ports/catalog';
import type { NavigationIntent } from '../ports/navigation';
import type { LocalText } from '../text/localText';
import { splitTitle } from '../text/splitTitle';
import { toneFor } from './tone';

/** A catalog course as `itera.catalog_programs()` returns it, membership-independent. */
export interface CatalogProgram {
  id: string;
  tenantId: string;
  /** The owning tenant slug (e.g. 'itera'), informational. */
  tenantSlug: string;
  slug: string;
  title: LocalText;
  createdAt: string;
  unitCount: number;
  lessonCount: number;
  activityCount: number;
  /** True when the caller already holds a membership in this program's tenant. */
  alreadyEnrolled: boolean;
  icon?: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/** The category of a course, by its position in the catalog: it picks the glyph and the tone of the card. */
const ICONS = ['code', 'layers', 'rocket', 'cpu', 'sparkles'];

/** The answer of the RPC `catalog_programs` as programs. Anything that is not a list of rows is no program. */
export function catalogProgramsOf(data: unknown): CatalogProgram[] {
  const rows = Array.isArray(data) ? (data as Row[]) : [];
  return rows.map((row, i) => ({
    id: str(row.id),
    tenantId: str(row.tenant_id),
    tenantSlug: str(row.tenant_slug),
    slug: str(row.slug),
    title: row.title_i18n && typeof row.title_i18n === 'object' ? (row.title_i18n as Record<string, string>) : {},
    createdAt: str(row.created_at),
    unitCount: num(row.unit_count),
    lessonCount: num(row.lesson_count),
    activityCount: num(row.activity_count),
    alreadyEnrolled: row.already_enrolled === true,
    icon: ICONS[i % ICONS.length],
  }));
}

/** The state of the enrollments the learner started, by program id. A program with no entry is idle. */
export type EnrollStates = Readonly<Record<string, { readonly pending: boolean; readonly failed: boolean } | undefined>>;

export interface CardContext {
  /** No active subscription: every card is locked, none can enroll. */
  visitor: boolean;
  /** The subscribe offer of a visitor's card. Absent inside the shell: nothing is sold there (PLAN Q-3, Q-11). */
  offer: { label: string; link: NavigationIntent } | undefined;
  /** Each enrollment in flight or failed, by program id: two cards can be enrolling at once, and each keeps its own state. */
  enrolling: EnrollStates;
  t: (key: string) => string;
  tText: (text: LocalText) => string;
}

/** Singular-aware "N label" ("1 lição", "2 lições"). */
const countLabel = (t: CardContext['t'], n: number, one: string, many: string) => `${n} ${t(n === 1 ? one : many).toLowerCase()}`;

function actionOf(program: CatalogProgram, ctx: CardContext): CatalogCardAction {
  if (ctx.visitor) return { kind: 'locked', subscribe: ctx.offer };
  if (program.alreadyEnrolled) return { kind: 'open' };
  const mine = ctx.enrolling[program.id];
  return { kind: 'enroll', pending: mine?.pending ?? false, failed: mine?.failed ?? false };
}

export function toCardView(program: CatalogProgram, ctx: CardContext): CatalogCardView {
  const { headline, subline } = splitTitle(ctx.tText(program.title));
  const { t } = ctx;
  return {
    id: program.id,
    slug: program.slug,
    headline,
    subline,
    counts: {
      lessons: countLabel(t, program.lessonCount ?? 0, 'label.lesson', 'label.lessons'),
      units: countLabel(t, program.unitCount ?? 0, 'label.unit', 'label.units'),
      activities: countLabel(t, program.activityCount ?? 0, 'label.activity', 'label.activities'),
    },
    icon: program.icon,
    tone: toneFor(program.icon),
    action: actionOf(program, ctx),
  };
}

/** The query as the page read it: pending without an error is the shimmer, an error or an unreachable first read is the error. */
export function listStateOf(query: { isPending: boolean; isError: boolean; unreachable: boolean }, programs: readonly CatalogProgram[], ctx: CardContext): CatalogListState {
  const failed = query.isError || query.unreachable;
  if (query.isPending && !failed) return { kind: 'loading' };
  if (failed) return { kind: 'error', unreachable: query.unreachable };
  if (programs.length === 0) return { kind: 'empty' };
  return { kind: 'ready', programs: programs.map((p) => toCardView(p, ctx)) };
}
