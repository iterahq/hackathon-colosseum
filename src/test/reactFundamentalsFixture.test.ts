import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTIVITY_KINDS,
  parseCodeBlankTokens,
  safeParseActivitySpec,
  type ActivityKind,
  type CodeCheck,
} from '@iterahq/activity-spec';
import { gradeSource, resetCodeSnackSandbox } from './support/codeSnackHarness';

interface FixtureActivity {
  ordinal: number;
  kind: string;
  status: string;
  spec: Record<string, unknown>;
  rubric: Record<string, unknown>;
  _solution?: string;
}

interface FixtureLesson {
  ordinal: number;
  key: string;
  title_i18n: { pt: string; en: string };
  activities: FixtureActivity[];
}

const ROOT = resolve(__dirname, '../..');
const fixture = JSON.parse(readFileSync(resolve(ROOT, 'db/seeds/react-fundamentals.fixture.json'), 'utf8'));
const lessons: FixtureLesson[] = fixture.program.units.flatMap((u: { lessons: FixtureLesson[] }) => u.lessons);
const activities = lessons.flatMap((lesson) => lesson.activities.map((activity) => ({ lesson, activity })));

const EXERCISE_KINDS = new Set(['single_choice', 'multi_choice', 'match', 'order', 'code', 'quiz', 'document']);
const RETIRED_KINDS = new Set(['sandbox_scenario', 'question']);
const FORBIDDEN_REFERENCES = [/cidade de deus/i, /tropa de elite/i, /tr[aá]fico/i, /favela/i, /tiroteio/i, /bandid/i];

function textOf(value: unknown): string {
  return JSON.stringify(value ?? '');
}

afterEach(resetCodeSnackSandbox);

describe('react fundamentals fixture — shape', () => {
  it('has 5 lessons with consecutive ordinals', () => {
    expect(lessons.map((l) => l.ordinal)).toEqual([0, 1, 2, 3, 4]);
    for (const lesson of lessons) {
      expect(lesson.activities.map((a) => a.ordinal)).toEqual(lesson.activities.map((_, i) => i));
      expect(lesson.title_i18n.pt && lesson.title_i18n.en).toBeTruthy();
    }
  });

  it.each(activities.map(({ lesson, activity }) => [`${lesson.key}#${activity.ordinal} ${activity.kind}`, activity] as const))(
    '%s passes the shared activity-spec parser',
    (_, activity) => {
      expect(ACTIVITY_KINDS).toContain(activity.kind);
      expect(RETIRED_KINDS.has(activity.kind), `${activity.kind} is not written to itera.activities`).toBe(false);
      const parsed = safeParseActivitySpec(activity.kind as ActivityKind, activity.spec);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
      expect(activity.status).toBe('published');
    },
  );
});

describe('react fundamentals fixture — authoring rules', () => {
  it.each(lessons.map((l) => [l.key, l] as const))('%s opens with context and a metaphor that shows the real artifact', (_, lesson) => {
    const first = lesson.activities[0];
    expect(first.kind).toBe('concept');
    const instruction = first.spec.instruction as { text?: string; image_url?: string };
    expect(instruction.image_url, 'the metaphor screen carries an image of the real app').toMatch(/^\/lesson-media\/react-fundamentals\/.+\.png$/);
    expect(existsSync(resolve(ROOT, 'public', `.${instruction.image_url}`)), `${instruction.image_url} is committed`).toBe(true);
  });

  it.each(lessons.map((l) => [l.key, l] as const))('%s explains before it asks: every exercise comes after at least two concept screens', (_, lesson) => {
    const firstExercise = lesson.activities.findIndex((a) => EXERCISE_KINDS.has(a.kind));
    expect(firstExercise).toBeGreaterThanOrEqual(2);
    expect(lesson.activities.slice(0, firstExercise).every((a) => a.kind === 'concept')).toBe(true);
    expect(lesson.activities.some((a) => EXERCISE_KINDS.has(a.kind) && a.kind !== 'code'), 'a quick check after the concepts').toBe(true);
    expect(lesson.activities.some((a) => a.kind === 'code'), 'hands-on code').toBe(true);
  });

  it('concept screens are light markdown, never the retired `---` continuation', () => {
    for (const { activity } of activities.filter(({ activity }) => activity.kind === 'concept')) {
      const text = (activity.spec.instruction as { text: string }).text;
      expect(text.split('\n').some((line) => line.trim() === '---')).toBe(false);
      expect(text.startsWith('## '), 'each concept screen opens with a heading').toBe(true);
    }
  });

  it('carries no cultural reference the Itera rules forbid', () => {
    for (const { activity } of activities) {
      for (const pattern of FORBIDDEN_REFERENCES) expect(textOf(activity.spec)).not.toMatch(pattern);
    }
  });
});

const blankSnacks = activities.filter(({ activity }) => activity.kind === 'code' && Array.isArray(activity.spec.blanks));
const checkedSnacks = activities.filter(({ activity }) => activity.kind === 'code' && Array.isArray(activity.spec.checks));

describe.each(blankSnacks.map(({ lesson, activity }) => [`${lesson.key}#${activity.ordinal}`, activity] as const))(
  'fill-in snack %s',
  (_, activity) => {
    it('every blank is placed once and every answer is offered', () => {
      const blanks = activity.spec.blanks as { id: string; kind: string; answer: string; options?: string[] }[];
      expect(parseCodeBlankTokens(activity.spec.starter as string).sort()).toEqual(blanks.map((b) => b.id).sort());
      for (const blank of blanks) {
        if (blank.kind === 'bank') expect(activity.spec.word_bank).toContain(blank.answer);
        if (blank.kind === 'select') expect(blank.options).toContain(blank.answer);
      }
    });
  },
);

describe.each(checkedSnacks.map(({ lesson, activity }) => [`${lesson.key}#${activity.ordinal}`, activity] as const))(
  'graded snack %s',
  (_, activity) => {
    const checks = activity.spec.checks as CodeCheck[];

    it('every check has a label and a hint', () => {
      for (const check of checks) {
        expect(check.label.length).toBeGreaterThan(3);
        expect(check.hint, `check ${check.id} has no hint`).toBeTruthy();
      }
      expect(activity._solution, 'a checked snack ships a _solution for this test').toBeTruthy();
    });

    it('the STARTER fails at least one check', async () => {
      const results = await gradeSource(activity.spec.starter as string, checks);
      expect(results.some((r) => !r.passed)).toBe(true);
    });

    it('the _solution passes every check', async () => {
      const results = await gradeSource(activity._solution as string, checks);
      const failed = results.filter((r) => !r.passed).map((r) => r.id);
      expect(failed, `checks that did not pass: ${failed.join(', ')}`).toEqual([]);
    });
  },
);
