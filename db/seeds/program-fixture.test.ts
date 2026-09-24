import { describe, expect, it } from 'vitest';
import {
  activityIdemKey,
  buildMediaPlan,
  buildPlan,
  collectLessonMediaRefs,
  lessonIdemKey,
  mimeTypeFor,
  rewriteLessonMediaUrls,
  stripUnderscoreKeys,
  unitIdemKey,
  type Fixture,
} from './program-fixture';

describe('stripUnderscoreKeys', () => {
  it('drops top-level and nested `_`-prefixed keys', () => {
    const input = {
      _comment: ['fixture-only'],
      program: {
        slug: 'p',
        activities: [{ ordinal: 0, spec: { text: 'x' }, _solution: 'secret' }],
      },
    };
    expect(stripUnderscoreKeys(input)).toEqual({
      program: { slug: 'p', activities: [{ ordinal: 0, spec: { text: 'x' } }] },
    });
  });

  it('leaves keys that merely contain an underscore alone', () => {
    const input = { title_i18n: { pt: 'a', en: 'b' }, correct_option_id: 'x' };
    expect(stripUnderscoreKeys(input)).toEqual(input);
  });

  it('passes primitives and arrays through unchanged', () => {
    expect(stripUnderscoreKeys(3)).toBe(3);
    expect(stripUnderscoreKeys('s')).toBe('s');
    expect(stripUnderscoreKeys(null)).toBe(null);
    expect(stripUnderscoreKeys([1, { _x: 1, y: 2 }])).toEqual([1, { y: 2 }]);
  });
});

describe('collectLessonMediaRefs', () => {
  it('finds a lesson-media path at any depth, under any key name', () => {
    const spec = {
      instruction: { text: 'hi', image_url: '/lesson-media/react-fundamentals/aula-1.png' },
      options: [{ id: 'a', image_url: '/lesson-media/react-fundamentals/opt-a.webp' }],
      imageUrl: '/lesson-media/react-effects/diagram.svg', // the `diagram` kind's camelCase field
    };
    expect([...collectLessonMediaRefs(spec)].sort()).toEqual([
      '/lesson-media/react-effects/diagram.svg',
      '/lesson-media/react-fundamentals/aula-1.png',
      '/lesson-media/react-fundamentals/opt-a.webp',
    ]);
  });

  it('ignores a string that merely mentions the path outside a lesson-media root', () => {
    const spec = { text: 'see /lesson-media/x.png in the doc', other: 'https://example.com/lesson-media/y.png' };
    expect(collectLessonMediaRefs(spec).size).toBe(0);
  });

  it('returns an empty set for a spec with no media', () => {
    expect(collectLessonMediaRefs({ instruction: { text: 'no images here' } }).size).toBe(0);
  });
});

describe('rewriteLessonMediaUrls', () => {
  it('rewrites every mapped path and leaves everything else untouched', () => {
    const urlMap = new Map([
      ['/lesson-media/x/a.png', 'https://cdn.example/storage/v1/object/public/lesson-media/x/a.png'],
    ]);
    const spec = {
      instruction: { text: 'hi', image_url: '/lesson-media/x/a.png' },
      unrelated: '/lesson-media/x/b.png',
      ordinal: 3,
    };
    expect(rewriteLessonMediaUrls(spec, urlMap)).toEqual({
      instruction: { text: 'hi', image_url: 'https://cdn.example/storage/v1/object/public/lesson-media/x/a.png' },
      unrelated: '/lesson-media/x/b.png',
      ordinal: 3,
    });
  });

  it('is a no-op on an empty map', () => {
    const spec = { a: '/lesson-media/x/a.png', b: [1, 2] };
    expect(rewriteLessonMediaUrls(spec, new Map())).toEqual(spec);
  });
});

describe('mimeTypeFor', () => {
  it('maps every extension the lesson-media bucket accepts', () => {
    expect(mimeTypeFor('/lesson-media/x/a.svg')).toBe('image/svg+xml');
    expect(mimeTypeFor('/lesson-media/x/a.png')).toBe('image/png');
    expect(mimeTypeFor('/lesson-media/x/a.jpg')).toBe('image/jpeg');
    expect(mimeTypeFor('/lesson-media/x/a.jpeg')).toBe('image/jpeg');
    expect(mimeTypeFor('/lesson-media/x/a.webp')).toBe('image/webp');
    expect(mimeTypeFor('/lesson-media/x/a.gif')).toBe('image/gif');
  });

  it('returns undefined for an unaccepted or missing extension', () => {
    expect(mimeTypeFor('/lesson-media/x/a.bmp')).toBeUndefined();
    expect(mimeTypeFor('/lesson-media/x/noext')).toBeUndefined();
  });
});

describe('idempotency keys', () => {
  it('are stable natural keys, not random or DB-derived', () => {
    expect(unitIdemKey('react-fundamentos-todo', 0)).toBe('react-fundamentos-todo#unit:0');
    expect(lessonIdemKey('react-fundamentos-todo', 0, 'a-lista-na-tela')).toBe(
      'react-fundamentos-todo#unit:0#lesson:a-lista-na-tela'
    );
    expect(activityIdemKey('react-fundamentos-todo#unit:0#lesson:a-lista-na-tela', 2)).toBe(
      'react-fundamentos-todo#unit:0#lesson:a-lista-na-tela#activity:2'
    );
  });

  it('two different lessons with the same ordinal in different units never collide', () => {
    const a = lessonIdemKey('p', 0, 'intro');
    const b = lessonIdemKey('p', 1, 'intro');
    expect(a).not.toBe(b);
  });
});

const FIXTURE: Fixture = {
  program: {
    slug: 'demo-program',
    title_i18n: { pt: 'Demo', en: 'Demo' },
    units: [
      {
        ordinal: 0,
        title_i18n: { pt: 'U0', en: 'U0' },
        lessons: [
          {
            ordinal: 0,
            key: 'l0',
            title_i18n: { pt: 'L0', en: 'L0' },
            activities: [
              { ordinal: 0, kind: 'concept', status: 'published', spec: { instruction: { text: 'hi' } }, rubric: {} },
              {
                ordinal: 1,
                kind: 'concept',
                status: 'published',
                spec: { instruction: { text: 'hi', image_url: '/lesson-media/demo/a.png' } },
                rubric: {},
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('buildPlan', () => {
  it('describes the fixture shape without touching the network', () => {
    const steps = buildPlan(FIXTURE, 'acme', { catalog: false });
    expect(steps.map((s) => s.kind)).toEqual(['program', 'unit', 'lesson', 'activity', 'activity']);
    expect(steps[0].label).toContain("tenant 'acme'");
    expect(steps[0].label).not.toContain('is_catalog');
  });

  it('flags the catalog upsert when --catalog is set', () => {
    const steps = buildPlan(FIXTURE, 'acme', { catalog: true });
    expect(steps[0].label).toContain('is_catalog=true');
  });

  it('keys every step with its idempotency key', () => {
    const steps = buildPlan(FIXTURE, 'acme', { catalog: false });
    const lessonStep = steps.find((s) => s.kind === 'lesson');
    expect(lessonStep?.key).toBe(lessonIdemKey('demo-program', 0, 'l0'));
  });
});

describe('buildMediaPlan', () => {
  it('collects every lesson-media reference across the whole program tree, sorted', () => {
    expect(buildMediaPlan(FIXTURE)).toEqual(['/lesson-media/demo/a.png']);
  });

  it('returns an empty plan for a fixture with no media', () => {
    const noMedia: Fixture = {
      program: { ...FIXTURE.program, units: [{ ...FIXTURE.program.units[0], lessons: [] }] },
    };
    expect(buildMediaPlan(noMedia)).toEqual([]);
  });
});
