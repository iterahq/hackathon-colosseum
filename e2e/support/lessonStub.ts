/**
 * The real `/lesson/:lessonId` route over the stub origin: one lesson per
 * fixture, the fixture first and a reading card after it, so the lesson chrome
 * (progress, controls, title) is the one a learner sees. Same substrate as
 * `harnessStub.ts`; it adds the two reads the player makes on top of it.
 */
import type { Page, Route } from '@playwright/test';
import type { ActivityFixture } from './activityFixtures';
import { installHarnessSubstrate, STUB_SUPABASE_URL } from './harnessStub';

/** The title of the lesson filmed on the iPhone: two lines at 390 px before the height pass. */
export const LESSON_TITLE = 'Dia 1 — Minha página nasce: tags e esqueleto';

const NEXT_ACTIVITY_ID = '00000000-0000-4000-9200-000000000001';

function lessonRow(fx: ActivityFixture, title: string) {
  const activity = (id: string, ordinal: number, kind: string, spec: unknown, rubric: unknown = {}) => ({
    id,
    lesson_id: fx.id,
    ordinal,
    kind,
    spec,
    rubric,
    artifact_policy: {},
  });
  return {
    id: fx.id,
    title_i18n: { pt: title, en: title },
    ordinal: 1,
    unit: { id: fx.id, ordinal: 1, program_id: fx.id, title_i18n: { pt: 'Semana 1' }, program: { slug: 'html-do-zero' } },
    activities: [
      activity(fx.id, 0, fx.kind, fx.spec, fx.rubric),
      activity(NEXT_ACTIVITY_ID, 1, 'concept', { instruction: { text: 'Fim.' } }),
    ],
  };
}

export async function installLessonSubstrate(page: Page, fx: ActivityFixture, title = LESSON_TITLE): Promise<void> {
  await installHarnessSubstrate(page, [fx]);
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/lessons*`, (route) => route.fulfill(json(lessonRow(fx, title))));
  // The learner's own record, remembered for the life of the page: a reload
  // reads back what was written, like the real database.
  const progress = new Map<string, string>();
  const attempts: Array<Record<string, unknown>> = [];
  const traces: Array<Record<string, unknown>> = [];
  const rowsOf = (route: Route): Array<Record<string, unknown>> => {
    const body = route.request().postDataJSON() as Record<string, unknown> | Array<Record<string, unknown>>;
    return Array.isArray(body) ? body : [body];
  };
  const eq = (route: Route, column: string): string | null =>
    new URL(route.request().url()).searchParams.get(column)?.replace(/^eq\./, '') ?? null;
  const newestFirst = (rows: Array<Record<string, unknown>>, column: string) =>
    [...rows].sort((a, b) => String(b[column]).localeCompare(String(a[column])));

  await page.route(`${STUB_SUPABASE_URL}/rest/v1/progress*`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(json([...progress].map(([activity_id, status]) => ({ activity_id, status }))));
    }
    const keepExisting = (route.request().headers()['prefer'] ?? '').includes('ignore-duplicates');
    for (const row of rowsOf(route)) {
      const id = String(row.activity_id);
      if (!(keepExisting && progress.has(id))) progress.set(id, String(row.status));
    }
    return route.fulfill(json([]));
  });
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/activity_results*`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill(json(newestFirst(attempts, 'created_at')));
    for (const row of rowsOf(route)) attempts.push({ ...row, created_at: new Date().toISOString() });
    return route.fulfill(json([]));
  });
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/activity_traces*`, (route) => {
    if (route.request().method() === 'GET') {
      const activityId = eq(route, 'activity_id');
      return route.fulfill(
        json(newestFirst(traces.filter((t) => !activityId || t.activity_id === activityId), 'started_at')),
      );
    }
    traces.push(...rowsOf(route));
    return route.fulfill(json([]));
  });
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/my_subscription*`, (route) =>
    route.fulfill(json([{ status: 'active', is_active: true, current_period_end: null, seat_count: 1, cancel_at_period_end: false }])),
  );
}

export function lessonUrl(fx: ActivityFixture): string {
  return `/lesson/${fx.id}`;
}
