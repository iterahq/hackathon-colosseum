/**
 * WHAT PERSISTS — authored, not inferred.
 *
 * Plan: 20260728-itera-artifact-storage. Migration `0027`.
 *
 * ## The problem this replaces
 *
 * After PR #191 the answer to "does this activity keep what the learner wrote?"
 * was a fact about `ActivityRenderer.tsx`: the reflection `document` and the
 * AI-judge `document` called `onComplete(true, { artifact })`, and no other kind
 * did. That inference was invisible to the person authoring the lesson,
 * impossible to query, and — the part that actually matters — wrong for the
 * case Tainan named:
 *
 * > "às vezes uma resposta determinística ainda pode gerar algo útil que deve
 * >  ser persistido — seria como um template que, a partir de uma
 * >  pré-engenharia do nosso usuário, gera algo útil mesmo sem usar IA."
 *
 * A deterministic multiple-choice CAN produce a deliverable. Whether it does is
 * a pedagogical decision belonging to the author, not a branch in a renderer.
 *
 * ## The model
 *
 * Two layers, resolved here and nowhere else:
 *
 * 1. **A default per activity kind** (`KIND_ARTIFACT_DEFAULTS`) — so an author
 *    who configures nothing still gets sensible behaviour.
 * 2. **An authored override** (`itera.activities.artifact_policy`) — `mode`
 *    forces persistence on (`always`) or off (`never`) regardless of the kind
 *    default, and `type` / `filename` / `template` / `repoPath` shape the result.
 *
 * ## Non-regression, stated precisely
 *
 * Every one of the 123 activities in the database has `artifact_policy = '{}'`,
 * which resolves to `mode: 'auto'`. Under `auto` the kind defaults below persist
 * `document` and nothing else — which is EXACTLY what the renderer did before
 * this module existed. Turning this on changes no existing lesson's behaviour;
 * it only makes the behaviour addressable. `artifactPolicy.test.ts` pins that
 * equivalence so a future edit to the defaults table cannot silently break it.
 *
 * ## Purity
 *
 * No React, no network, no Supabase — per the repo's service convention. Every
 * function here is deterministic, which is what lets the tests assert the
 * defaults table rather than mock a database.
 */
import type { Activity, ActivityKind } from '@/types/content';
import type { ArtifactType, ProducedArtifact } from '@/services/artifact.service';

/**
 * How the authored policy relates to the kind default.
 *
 * `auto` is the default and the only value that reads `KIND_ARTIFACT_DEFAULTS`;
 * the other two are explicit author intent and win outright.
 */
export type ArtifactMode = 'auto' | 'always' | 'never';

/** The authored policy, as stored in `itera.activities.artifact_policy`. */
export interface ArtifactPolicy {
  mode?: ArtifactMode;
  /** Override the artifact type the kind default would pick. */
  type?: ArtifactType;
  /** Override the file name shown in "My repository" (e.g. `decisao.md`). */
  filename?: string;
  /**
   * Renders the learner's raw response into something worth keeping, WITHOUT
   * any AI in the loop — the "pré-engenharia do nosso usuário" case. Supports
   * `{{content}}`, `{{response}}`, `{{title}}`, `{{kind}}` and `{{date}}`.
   */
  template?: string;
  /** Override the git-shaped folder path (see `buildRepoPath`). */
  repoPath?: string;
}

/** A policy after the kind default and the authored override have been merged. */
export interface ResolvedArtifactPolicy {
  persist: boolean;
  type: ArtifactType;
  filename: string;
  template?: string;
  repoPath?: string;
  /** Whether persistence was decided by the kind default or by the author. */
  decidedBy: 'kind-default' | 'author';
}

interface KindDefault {
  persist: boolean;
  type: ArtifactType;
  filename: string;
}

/**
 * THE DEFAULT PER ACTIVITY TYPE.
 *
 * `persist: true` only where the learner authors free-form content that would
 * otherwise be destroyed. Everything else defaults to `false` — but carries a
 * sensible `type`/`filename` anyway, so an author flipping `mode: 'always'`
 * gets a working artifact without having to fill in every field.
 *
 * Rationale for the two `true`s:
 *  - `document` — the reflection and the AI-judge submission. This is the loss
 *    PR #191 was written to stop; it must stay on by default.
 *  - `code` — the learner's source is the archetypal deliverable (the
 *    `button.tsx` case that motivated the whole plan). ⚠️ Not yet WIRED: the
 *    producer lives in `codeSnapshot.service.ts`, owned by open PR #185. The
 *    default is correct in advance so that wiring it later is one call site,
 *    not another policy decision.
 *
 * `diagram` is `false` because the mermaid comes from the AUTHOR's spec — the
 * learner only reads it and clicks Done, so there is nothing of theirs to keep.
 * `sandbox_scenario` is `false` because its replies are canned; the transcript
 * is a plausible future deliverable, which is why it has a filename ready.
 */
export const KIND_ARTIFACT_DEFAULTS: Record<ActivityKind, KindDefault> = {
  document: { persist: true, type: 'text', filename: 'reflection.md' },
  code: { persist: true, type: 'code', filename: 'solution.txt' },
  diagram: { persist: false, type: 'diagram', filename: 'diagram.mmd' },
  quiz: { persist: false, type: 'text', filename: 'answer.md' },
  concept: { persist: false, type: 'text', filename: 'notes.md' },
  concept_reveal: { persist: false, type: 'text', filename: 'notes.md' },
  single_choice: { persist: false, type: 'text', filename: 'answer.md' },
  multi_choice: { persist: false, type: 'text', filename: 'answer.md' },
  match: { persist: false, type: 'text', filename: 'answer.md' },
  order: { persist: false, type: 'text', filename: 'answer.md' },
  video: { persist: false, type: 'text', filename: 'notes.md' },
  sandbox_scenario: { persist: false, type: 'document', filename: 'transcript.md' },
};

const MODES: ReadonlySet<string> = new Set<ArtifactMode>(['auto', 'always', 'never']);
const TYPES: ReadonlySet<string> = new Set<ArtifactType>([
  'code',
  'text',
  'document',
  'diagram',
  'site',
]);

/**
 * Read an `artifact_policy` jsonb blob defensively.
 *
 * Unknown keys are dropped and invalid values are IGNORED rather than throwing:
 * a malformed policy must degrade to the kind default, never break a lesson the
 * learner is in the middle of. The DB CHECK constraint in `0027` is the strict
 * gate; this is the belt to its braces, because the column can also arrive from
 * an older client or a hand-written row.
 */
export function parseArtifactPolicy(raw: unknown): ArtifactPolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const policy: ArtifactPolicy = {};

  if (typeof r.mode === 'string' && MODES.has(r.mode)) policy.mode = r.mode as ArtifactMode;
  if (typeof r.type === 'string' && TYPES.has(r.type)) policy.type = r.type as ArtifactType;
  if (typeof r.filename === 'string' && r.filename.trim() !== '') {
    policy.filename = sanitizeFilename(r.filename);
  }
  if (typeof r.template === 'string' && r.template !== '') policy.template = r.template;
  if (typeof r.repoPath === 'string' && r.repoPath.trim() !== '') policy.repoPath = r.repoPath.trim();

  return policy;
}

/**
 * Strip anything that would let a filename escape its folder or break the
 * git-shaped path. Path separators and traversal are the whole risk here — the
 * value reaches both a storage key extension and a `repo_path` segment.
 */
export function sanitizeFilename(name: string): string {
  const flat = name.trim().replace(/[/\\]+/g, '-').replace(/\.{2,}/g, '.');
  const safe = flat.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[.-]+/, '');
  return safe === '' ? 'artifact.txt' : safe.slice(0, 120);
}

/**
 * Merge the kind default with the authored override.
 *
 * Precedence, lowest to highest: kind default → the descriptor the activity
 * component handed up (it knows its own sub-case — the AI-judge document names
 * itself `data-spec.md`, which no kind default could know) → the authored
 * policy, which always wins because it is the explicit human decision.
 */
export function resolveArtifactPolicy(
  activity: Pick<Activity, 'kind' | 'artifactPolicy'>,
  produced?: Pick<ProducedArtifact, 'type' | 'filename'> | null
): ResolvedArtifactPolicy {
  const kindDefault = KIND_ARTIFACT_DEFAULTS[activity.kind] ?? {
    persist: false,
    type: 'text' as ArtifactType,
    filename: 'artifact.txt',
  };
  const policy = parseArtifactPolicy(activity.artifactPolicy);
  const mode = policy.mode ?? 'auto';

  const persist =
    mode === 'always' ? true : mode === 'never' ? false : kindDefault.persist;

  return {
    persist,
    type: policy.type ?? produced?.type ?? kindDefault.type,
    filename: policy.filename ?? produced?.filename ?? kindDefault.filename,
    template: policy.template,
    repoPath: policy.repoPath,
    decidedBy: mode === 'auto' ? 'kind-default' : 'author',
  };
}

/** Convenience predicate — "would this activity keep the learner's work?". */
export function persistsArtifact(
  activity: Pick<Activity, 'kind' | 'artifactPolicy'>
): boolean {
  return resolveArtifactPolicy(activity).persist;
}

/** Variables a template may interpolate. */
export interface TemplateVars {
  /** What the learner produced (free text, code, or a rendered answer summary). */
  content: string;
  /** The activity's prompt/title, for a heading. */
  title?: string;
  kind?: string;
  /** ISO date, so a deliverable can carry when it was made. */
  date?: string;
}

/**
 * Render `{{placeholder}}` templates.
 *
 * Intentionally NOT a general template engine: no conditionals, no loops, no
 * expression evaluation. The values are learner-authored text that ends up in a
 * stored file, so the only safe engine is one that cannot execute anything.
 * `{{response}}` is an alias of `{{content}}` because both readings are natural
 * for an author writing this in a form.
 */
export function renderArtifactTemplate(template: string, vars: TemplateVars): string {
  const table: Record<string, string> = {
    content: vars.content,
    response: vars.content,
    title: vars.title ?? '',
    kind: vars.kind ?? '',
    date: vars.date ?? new Date().toISOString().slice(0, 10),
  };
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key: string) => {
    const value = table[key];
    // An unknown placeholder is left VERBATIM rather than blanked — silently
    // deleting it would hide the author's typo inside the learner's file.
    return value === undefined ? match : value;
  });
}

/**
 * URL/path-safe slug for a repo path segment.
 *
 * Accent folding matters here: Portuguese titles are the common case, and
 * `Modelagem de Informação` must become `modelagem-de-informacao`, not
 * `modelagem-de-informa-o`.
 */
export function slugify(input: string, fallback = 'item'): string {
  const slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug === '' ? fallback : slug;
}

/** Where an artifact sits in the lesson hierarchy — everything `repo_path` needs. */
export interface RepoPathContext {
  programSlug?: string | null;
  unitTitle?: string | null;
  unitOrdinal?: number | null;
  lessonTitle?: string | null;
  lessonOrdinal?: number | null;
  activityOrdinal?: number | null;
  activityTitle?: string | null;
}

/** Two-digit ordinal so a plain lexical sort matches lesson order. */
function numbered(ordinal: number | null | undefined, title: string | null | undefined, fallback: string): string {
  const slug = slugify(title ?? '', fallback);
  if (typeof ordinal !== 'number' || !Number.isFinite(ordinal)) return slug;
  return `${String(Math.max(0, Math.trunc(ordinal))).padStart(2, '0')}-${slug}`;
}

/**
 * Build the git-shaped LOGICAL path of an artifact.
 *
 *   <program>/<NN-unit>/<NN-lesson>/<NN-activity>/<filename>
 *   data-modeling/01-fundamentos/02-modelagem/03-reflexao/reflection.md
 *
 * The same string is the folder tree the learner browses, the grouping the
 * tenant admin reads, and the path this file will occupy in a real repository
 * in Phase 4. That triple duty is the point — Tainan asked for the UI and the
 * extracted data to already be correlated with the eventual git export, so
 * publishing later is a `git add` at this path rather than a new mapping layer
 * invented after the fact.
 *
 * ⚠️ NOT the storage key. Storage stays content-addressed at
 * `<auth-uid>/<activity-id>/<sha256>.<ext>` because the bucket's RLS predicate
 * compares the first path segment to `auth.uid()`.
 */
export function buildRepoPath(filename: string, ctx: RepoPathContext): string {
  const segments = [
    slugify(ctx.programSlug ?? '', 'program'),
    numbered(ctx.unitOrdinal, ctx.unitTitle, 'unit'),
    numbered(ctx.lessonOrdinal, ctx.lessonTitle, 'lesson'),
    numbered(ctx.activityOrdinal, ctx.activityTitle, 'activity'),
    sanitizeFilename(filename),
  ];
  return segments.join('/');
}

/**
 * Turn what an activity handed up into the artifact that will actually be
 * stored — or `null` when this activity does not persist.
 *
 * Returning `null` (rather than a flag the caller must remember to check) is
 * deliberate: the player's call site becomes `const a = buildArtifact(...); if
 * (a) save(a);`, so "policy said no" and "nothing was produced" collapse into
 * the same, un-forgettable branch.
 */
export function buildArtifact(
  activity: Pick<Activity, 'kind' | 'artifactPolicy'>,
  produced: ProducedArtifact | null | undefined,
  options: { response?: string; title?: string } = {}
): ProducedArtifact | null {
  const resolved = resolveArtifactPolicy(activity, produced);
  if (!resolved.persist) return null;

  // The activity's own content wins; otherwise the deterministic answer summary
  // it handed up. This is what lets a multiple-choice produce a deliverable.
  const raw = produced?.content ?? options.response ?? '';
  const content = resolved.template
    ? renderArtifactTemplate(resolved.template, {
        content: raw,
        title: options.title,
        kind: activity.kind,
      })
    : raw;

  if (content.trim() === '') return null;

  return {
    type: resolved.type,
    content,
    filename: resolved.filename,
    mimeType: produced?.mimeType ?? mimeTypeFor(resolved.filename),
  };
}

/**
 * A human-readable name for an activity, for the repo-path segment and the
 * `{{title}}` template variable.
 *
 * Reads the already-locale-resolved `spec` (see `resolveLocalizedSpec` in
 * programs.service), falling back to the kind so a segment is never empty.
 */
export function activityTitleOf(activity: Pick<Activity, 'kind' | 'spec'>): string {
  const spec = (activity.spec ?? {}) as Record<string, unknown>;
  for (const key of ['title', 'prompt', 'question', 'instruction']) {
    const value = spec[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return activity.kind;
}

/** Best-effort mime from the extension — the bucket whitelists a fixed set. */
export function mimeTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'json':
      return 'application/json';
    case 'html':
      return 'text/plain'; // NEVER text/html — learner-controlled bytes (see 0025 risks)
    case 'csv':
      return 'text/csv';
    case 'mmd':
      return 'text/plain';
    default:
      return 'text/plain';
  }
}
