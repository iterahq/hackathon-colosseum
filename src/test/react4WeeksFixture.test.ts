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

/**
 * Validates `db/seeds/react-4-weeks.fixture.json`, the first Itera course:
 * one program, 4 units (one per week). Weeks 1–3 reuse lessons verbatim from
 * `react-fundamentals.fixture.json` / `react-effects.fixture.json` (already
 * covered by `reactFundamentalsFixture.test.ts`); this file re-checks them
 * here too because the program/unit nesting is new, and holds the newly
 * authored week 4 to the exact same bar.
 *
 * The multi-unit shape is why this isn't just another entry in
 * `reactFundamentalsFixture.test.ts`'s `UNITS` table: ordinals there are
 * asserted consecutive across ALL lessons of a single-unit program, but here
 * every unit restarts its own lesson ordinal at 0 (week 2's first lesson is
 * ordinal 0, not 3) — a different shape check, so a sibling test.
 */

interface FixtureActivity {
  ordinal: number;
  kind: string;
  status: string;
  spec: Record<string, unknown>;
  rubric: Record<string, unknown>;
  _solution?: string;
  _comment?: string[];
}

interface FixtureLesson {
  ordinal: number;
  key: string;
  title_i18n: { pt: string; en: string };
  activities: FixtureActivity[];
}

interface FixtureUnit {
  ordinal: number;
  title_i18n: { pt: string; en: string };
  lessons: FixtureLesson[];
}

const ROOT = resolve(__dirname, '../..');
const fixture = JSON.parse(readFileSync(resolve(ROOT, 'db/seeds/react-4-weeks.fixture.json'), 'utf8'));
const units: FixtureUnit[] = fixture.program.units;
const lessons: FixtureLesson[] = units.flatMap((u) => u.lessons);
const activities = lessons.flatMap((lesson) => lesson.activities.map((activity) => ({ lesson, activity })));

const EXERCISE_KINDS = new Set(['single_choice', 'multi_choice', 'match', 'order', 'code', 'quiz', 'document']);
const RETIRED_KINDS = new Set(['sandbox_scenario', 'question']);
const FORBIDDEN_REFERENCES = [/cidade de deus/i, /tropa de elite/i, /tr[aá]fico/i, /favela/i, /tiroteio/i, /bandid/i];

function textOf(value: unknown): string {
  return JSON.stringify(value ?? '');
}

/**
 * The one lesson allowed to open without an image: its `_comment` documents
 * why (no committed screenshot of a terminal build / live deploy exists) —
 * see itera-lesson-authoring §4, "never a fake image".
 */
function hasDocumentedImageTodo(activity: FixtureActivity): boolean {
  return Array.isArray(activity._comment) && activity._comment.some((line) => line.includes('TODO'));
}

afterEach(resetCodeSnackSandbox);

describe(`${fixture.program.slug} (react-4-weeks)`, () => {
  it('is one program with 4 weekly units, ordinals 0..3', () => {
    expect(units.map((u) => u.ordinal)).toEqual([0, 1, 2, 3]);
    for (const unit of units) {
      expect(unit.title_i18n.pt && unit.title_i18n.en).toBeTruthy();
    }
  });

  describe('shape', () => {
    it('every unit has its own lessons with consecutive ordinals starting at 0', () => {
      for (const unit of units) {
        expect(unit.lessons.map((l) => l.ordinal)).toEqual(unit.lessons.map((_, i) => i));
        for (const lesson of unit.lessons) {
          expect(lesson.activities.map((a) => a.ordinal)).toEqual(lesson.activities.map((_, i) => i));
          expect(lesson.title_i18n.pt && lesson.title_i18n.en).toBeTruthy();
        }
      }
    });

    it('every lesson key is unique across the whole program', () => {
      const keys = lessons.map((l) => l.key);
      expect(new Set(keys).size).toBe(keys.length);
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

  describe('authoring rules', () => {
    it.each(lessons.map((l) => [l.key, l] as const))('%s opens with context and a metaphor', (_, lesson) => {
      const first = lesson.activities[0];
      expect(first.kind).toBe('concept');
      const instruction = first.spec.instruction as { text?: string; image_url?: string };
      if (hasDocumentedImageTodo(first)) {
        // Documented exception: no real screenshot exists yet, and a fake or
        // mismatched one is worse than none (itera-lesson-authoring §4).
        expect(instruction.image_url, `${lesson.key} has no image_url and its documented TODO explains why`).toBeUndefined();
        return;
      }
      expect(instruction.image_url, `${lesson.key} carries an image of the real app, or a documented _comment TODO`).toMatch(/^\/lesson-media\/[\w-]+\/.+\.png$/);
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

    it('every media file a concept screen names is committed', () => {
      for (const { activity } of activities.filter(({ activity }) => activity.kind === 'concept')) {
        const text = (activity.spec.instruction as { text: string }).text;
        for (const path of text.match(/\/lesson-media\/[\w/.-]+/g) ?? []) {
          expect(existsSync(resolve(ROOT, 'public', `.${path}`)), `${path} is committed`).toBe(true);
        }
      }
    });

    it('graded code never reaches the network or localStorage (the preview sandbox has neither)', () => {
      for (const { activity } of activities.filter(({ activity }) => activity.kind === 'code')) {
        for (const source of [activity.spec.starter as string, activity._solution ?? '']) {
          const code = (source as string).replace(/\/\/.*$/gm, '');
          expect(code).not.toMatch(/\bfetch\(|localStorage|https?:\/\//);
        }
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
});
