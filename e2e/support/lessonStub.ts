/**
 * The real `/lesson/:lessonId` route over the stub origin: one lesson per
 * fixture, the fixture first and a reading card after it, so the lesson chrome
 * (progress, controls, title) is the one a learner sees. Same substrate as
 * `harnessStub.ts`; it adds the two reads the player makes on top of it.
 */
import type { Page } from '@playwright/test';
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
  await page.route(`${STUB_SUPABASE_URL}/rest/v1/my_subscription*`, (route) =>
    route.fulfill(json([{ status: 'active', is_active: true, current_period_end: null, seat_count: 1, cancel_at_period_end: false }])),
  );
}

export function lessonUrl(fx: ActivityFixture): string {
  return `/lesson/${fx.id}`;
}
