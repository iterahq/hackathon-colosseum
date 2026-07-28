/**
 * The authored-persistence resolver.
 *
 * Plan: 20260728-itera-artifact-storage. Migration `0027`.
 *
 * The most important test in this file is `non-regression`: it pins that an
 * activity with NO authored policy behaves exactly as the renderer did before
 * 0027 existed (document persists, nothing else does). Every one of the 123
 * activities currently in the database is in that state, so if that assertion
 * ever breaks, shipping the change would silently alter live lessons.
 */
import { describe, it, expect } from 'vitest';
import type { ActivityKind } from '@/types/content';
import {
  KIND_ARTIFACT_DEFAULTS,
  activityTitleOf,
  buildArtifact,
  buildRepoPath,
  mimeTypeFor,
  parseArtifactPolicy,
  persistsArtifact,
  renderArtifactTemplate,
  resolveArtifactPolicy,
  sanitizeFilename,
  slugify,
} from '@/services/artifactPolicy';

const act = (kind: ActivityKind, artifactPolicy: unknown = {}) =>
  ({ kind, artifactPolicy }) as never;

describe('KIND_ARTIFACT_DEFAULTS', () => {
  it('covers every activity kind (a missing kind would silently never persist)', () => {
    const kinds: ActivityKind[] = [
      'diagram',
      'document',
      'quiz',
      'code',
      'concept',
      'single_choice',
      'multi_choice',
      'match',
      'order',
      'video',
      'sandbox_scenario',
    ];
    for (const kind of kinds) {
      expect(KIND_ARTIFACT_DEFAULTS[kind], `missing default for ${kind}`).toBeDefined();
    }
    expect(Object.keys(KIND_ARTIFACT_DEFAULTS).sort()).toEqual([...kinds].sort());
  });
});

describe('non-regression: an unconfigured activity behaves exactly as before 0027', () => {
  it('persists `document` and nothing else', () => {
    // This is the pre-0027 renderer behaviour, restated as an assertion.
    expect(persistsArtifact(act('document'))).toBe(true);

    for (const kind of [
      'diagram',
      'quiz',
      'concept',
      'single_choice',
      'multi_choice',
      'match',
      'order',
      'video',
      'sandbox_scenario',
    ] as ActivityKind[]) {
      expect(persistsArtifact(act(kind)), `${kind} must not persist by default`).toBe(false);
    }
  });

  it('treats a null / absent policy the same as an empty one', () => {
    expect(persistsArtifact(act('document', null))).toBe(true);
    expect(persistsArtifact(act('document', undefined))).toBe(true);
    expect(persistsArtifact(act('single_choice', null))).toBe(false);
  });
});

describe('resolveArtifactPolicy', () => {
  it('mode=always turns a deterministic kind into a producer', () => {
    const resolved = resolveArtifactPolicy(act('single_choice', { mode: 'always' }));
    expect(resolved.persist).toBe(true);
    expect(resolved.decidedBy).toBe('author');
    expect(resolved.filename).toBe('answer.md');
  });

  it('mode=never overrides a kind default that would persist', () => {
    const resolved = resolveArtifactPolicy(act('document', { mode: 'never' }));
    expect(resolved.persist).toBe(false);
    expect(resolved.decidedBy).toBe('author');
  });

  it('lets the author override type and filename', () => {
    const resolved = resolveArtifactPolicy(
      act('single_choice', { mode: 'always', type: 'document', filename: 'decisao.md' })
    );
    expect(resolved.type).toBe('document');
    expect(resolved.filename).toBe('decisao.md');
  });

  it('ranks author over the component descriptor over the kind default', () => {
    const produced = { type: 'document' as const, filename: 'data-spec.md' };

    // No authored policy → the component's own descriptor wins over the default.
    expect(resolveArtifactPolicy(act('document'), produced).filename).toBe('data-spec.md');

    // Authored policy present → it wins over the component.
    expect(
      resolveArtifactPolicy(act('document', { filename: 'autorado.md' }), produced).filename
    ).toBe('autorado.md');
  });
});

describe('parseArtifactPolicy', () => {
  it('ignores invalid values rather than throwing, so a bad row degrades to the default', () => {
    expect(parseArtifactPolicy({ mode: 'sometimes' }).mode).toBeUndefined();
    expect(parseArtifactPolicy({ type: 'binary' }).type).toBeUndefined();
    expect(parseArtifactPolicy('nonsense')).toEqual({});
    expect(parseArtifactPolicy(['a'])).toEqual({});
    expect(parseArtifactPolicy(null)).toEqual({});
  });

  it('keeps valid values', () => {
    expect(parseArtifactPolicy({ mode: 'always', type: 'code' })).toMatchObject({
      mode: 'always',
      type: 'code',
    });
  });
});

describe('sanitizeFilename', () => {
  it('refuses path traversal and separators', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('a/b\\c.md')).toBe('a-b-c.md');
  });

  it('never returns an empty name', () => {
    expect(sanitizeFilename('   ')).toBe('artifact.txt');
    expect(sanitizeFilename('...')).toBe('artifact.txt');
  });
});

describe('renderArtifactTemplate', () => {
  it('interpolates content, response, title and kind', () => {
    const out = renderArtifactTemplate('# {{title}} ({{kind}})\n\n{{content}}', {
      content: 'minha resposta',
      title: 'Escolha',
      kind: 'single_choice',
    });
    expect(out).toBe('# Escolha (single_choice)\n\nminha resposta');
  });

  it('treats {{response}} as an alias of {{content}}', () => {
    expect(renderArtifactTemplate('{{response}}', { content: 'x' })).toBe('x');
  });

  it('leaves an unknown placeholder verbatim instead of blanking it', () => {
    // Silently deleting it would hide the author's typo inside a learner's file.
    expect(renderArtifactTemplate('{{nope}}', { content: 'x' })).toBe('{{nope}}');
  });
});

describe('buildArtifact', () => {
  it('returns null when the activity does not persist', () => {
    expect(
      buildArtifact(act('single_choice'), null, { response: 'Opção A' })
    ).toBeNull();
  });

  it('turns a deterministic answer into a deliverable via the template (no AI)', () => {
    const artifact = buildArtifact(
      act('single_choice', {
        mode: 'always',
        filename: 'decisao.md',
        template: '# Decisão\n\n{{response}}\n',
      }),
      null,
      { response: 'Escalar horizontalmente' }
    );
    expect(artifact).not.toBeNull();
    expect(artifact?.filename).toBe('decisao.md');
    expect(artifact?.content).toBe('# Decisão\n\nEscalar horizontalmente\n');
    expect(artifact?.mimeType).toBe('text/markdown');
  });

  it('returns null when nothing was actually produced', () => {
    expect(buildArtifact(act('document'), null, { response: '   ' })).toBeNull();
    expect(
      buildArtifact(act('document'), {
        type: 'text',
        content: '',
        filename: 'reflection.md',
      })
    ).toBeNull();
  });

  it('passes produced content through untouched when there is no template', () => {
    const artifact = buildArtifact(act('document'), {
      type: 'text',
      content: 'a minha reflexão',
      filename: 'reflection.md',
      mimeType: 'text/markdown',
    });
    expect(artifact?.content).toBe('a minha reflexão');
  });
});

describe('slugify / buildRepoPath', () => {
  it('folds Portuguese accents rather than mangling them', () => {
    expect(slugify('Modelagem de Informação')).toBe('modelagem-de-informacao');
    expect(slugify('Ação & Reação')).toBe('acao-reacao');
  });

  it('builds a git-shaped path with zero-padded ordinals so lexical sort matches lesson order', () => {
    const path = buildRepoPath('reflection.md', {
      programSlug: 'data-modeling',
      unitTitle: 'Fundamentos',
      unitOrdinal: 1,
      lessonTitle: 'Modelagem',
      lessonOrdinal: 2,
      activityTitle: 'Reflexão',
      activityOrdinal: 3,
    });
    expect(path).toBe(
      'data-modeling/01-fundamentos/02-modelagem/03-reflexao/reflection.md'
    );
  });

  it('degrades to placeholder segments instead of producing an empty path', () => {
    expect(buildRepoPath('a.md', {})).toBe('program/unit/lesson/activity/a.md');
  });

  it('cannot be used to escape the folder via the filename', () => {
    const path = buildRepoPath('../../../secret.md', { programSlug: 'p' });
    expect(path.split('/').filter((s) => s === '..')).toHaveLength(0);
  });
});

describe('activityTitleOf / mimeTypeFor', () => {
  it('prefers an explicit title, then the prompt, then the kind', () => {
    expect(activityTitleOf({ kind: 'document', spec: { title: 'T', prompt: 'P' } })).toBe('T');
    expect(activityTitleOf({ kind: 'document', spec: { prompt: 'P' } })).toBe('P');
    expect(activityTitleOf({ kind: 'document', spec: {} })).toBe('document');
  });

  it('never serves learner-authored bytes as text/html', () => {
    // A learner controls this content; text/html from our own origin would be XSS.
    expect(mimeTypeFor('evil.html')).toBe('text/plain');
    expect(mimeTypeFor('notes.md')).toBe('text/markdown');
  });
});
