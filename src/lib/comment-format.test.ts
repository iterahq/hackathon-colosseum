import { describe, it, expect } from 'vitest';
import {
  id8,
  padNumber,
  pickTitle,
  resolveCurrentVersion,
  nextVersionNumber,
  buildActivityRefs,
  buildVersionNumbers,
  formatCommentLine,
  formatCommentsForClipboard,
  type CommentFormatContext,
} from './comment-format';
import type { ActivityComment, UnitVersion } from '@/types/comments';
import type { UnitCanvas } from '@/services/authorCanvas.service';

/**
 * Golden-string guard for the per-unit review canvas clipboard format
 * (plan 20260706 V4). The crown jewel is that each comment line INLINES the
 * activity's current kind + spec JSON so an agent needs no extra fetch.
 */

const canvas: UnitCanvas = {
  tenantId: 'tenant-1',
  program: { id: 'prog-abcdef12-3456', slug: 'modele-dados', title: { pt: 'Modele Dados' } },
  unit: { id: 'unit-11112222-3333', programId: 'prog-abcdef12-3456', ordinal: 2, title: { pt: 'Unidade 2' } },
  lessons: [
    {
      id: 'lesson-aaaa1111-2222',
      unitId: 'unit-11112222-3333',
      ordinal: 3,
      title: { pt: 'Normalização' },
      activities: [
        {
          id: 'act-99998888-7777',
          lessonId: 'lesson-aaaa1111-2222',
          ordinal: 1,
          kind: 'single_choice',
          spec: { question_i18n: { pt: 'Qual é a 1FN?', en: 'What is 1NF?' } },
          rubric: null,
          publishStatus: 'draft',
        },
      ],
    },
  ],
};

const versions: UnitVersion[] = [
  { id: 'uv-1', unitId: 'unit-11112222-3333', versionNumber: 1, label: null, createdAt: '2026-07-06T00:00:00Z' },
  { id: 'uv-2', unitId: 'unit-11112222-3333', versionNumber: 2, label: 'round 2', createdAt: '2026-07-06T01:00:00Z' },
];

function makeComment(over: Partial<ActivityComment> = {}): ActivityComment {
  return {
    id: 'c1',
    tenantId: 'tenant-1',
    programId: 'prog-abcdef12-3456',
    unitId: 'unit-11112222-3333',
    lessonId: 'lesson-aaaa1111-2222',
    activityId: 'act-99998888-7777',
    unitVersionId: 'uv-2',
    body: 'troca o enunciado   pro pt-BR',
    authorId: 'author-1',
    resolved: false,
    anchorX: 0.5,
    anchorY: 0.25,
    createdAt: '2026-07-06T02:00:00Z',
    updatedAt: '2026-07-06T02:00:00Z',
    ...over,
  };
}

describe('comment-format small utilities', () => {
  it('id8 strips dashes and takes 8 chars', () => {
    expect(id8('prog-abcdef12-3456')).toBe('progabcd');
  });
  it('padNumber zero-pads to 2 digits', () => {
    expect(padNumber(1)).toBe('01');
    expect(padNumber(12)).toBe('12');
  });
  it('pickTitle prefers pt then en', () => {
    expect(pickTitle({ en: 'Only EN' })).toBe('Only EN');
    expect(pickTitle(undefined)).toBe('—');
  });
});

describe('version resolution', () => {
  it('resolveCurrentVersion picks max versionNumber', () => {
    expect(resolveCurrentVersion(versions)?.id).toBe('uv-2');
    expect(resolveCurrentVersion([])).toBeNull();
  });
  it('nextVersionNumber is max + 1 (or 1 when empty)', () => {
    expect(nextVersionNumber(versions)).toBe(3);
    expect(nextVersionNumber([])).toBe(1);
  });
});

describe('formatCommentLine (golden)', () => {
  const ctx: CommentFormatContext = {
    activityRefs: buildActivityRefs(canvas),
    versionNumbers: buildVersionNumbers(versions),
  };

  it('emits the stable ref header + inlined kind + spec, whitespace-collapsed body', () => {
    const line = formatCommentLine(makeComment(), ctx);
    expect(line).toBe(
      '[program:Modele Dados#progabcd] [unit:Unidade 2#unit1111] [lesson:Normalização#03#lessonaa] [activity:01#act99998] (uv2) — troca o enunciado pro pt-BR\n' +
        '  kind: single_choice\n' +
        '  spec: {"question_i18n":{"pt":"Qual é a 1FN?","en":"What is 1NF?"}}',
    );
  });

  it('marks resolved comments', () => {
    const line = formatCommentLine(makeComment({ resolved: true }), ctx);
    expect(line).toContain('(uv2) resolved — ');
  });

  it('degrades gracefully to ?-placeholders when the activity ref is missing', () => {
    const emptyCtx: CommentFormatContext = { activityRefs: new Map(), versionNumbers: new Map() };
    const line = formatCommentLine(makeComment(), emptyCtx);
    expect(line).toContain('[activity:?#act99998]');
    expect(line).toContain('(uv?)');
    expect(line).toContain('kind: ?');
    expect(line).toContain('spec: {}');
  });
});

describe('formatCommentsForClipboard', () => {
  const ctx: CommentFormatContext = {
    activityRefs: buildActivityRefs(canvas),
    versionNumbers: buildVersionNumbers(versions),
  };
  it('joins one block per comment separated by a blank line', () => {
    const block = formatCommentsForClipboard([makeComment({ id: 'a' }), makeComment({ id: 'b', body: 'add distractor' })], ctx);
    const blocks = block.split('\n\n');
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toContain('add distractor');
  });
});
