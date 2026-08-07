/**
 * The FROZEN activity catalogue the characterization baseline drives.
 *
 * One representative per renderable kind (Q2 of sub-plano 0, answered "um
 * representante por kind"), plus a second entry ONLY where a kind has real
 * STRUCTURAL variation — a different screen, not different content.
 *
 * ## Why fixtures instead of real rows
 *
 * The suite must be able to reach a CORRECT verdict and an INCORRECT one for
 * every graded kind (V2). That is only possible if the answer key is known at
 * authoring time. Discovering a live activity and asserting
 * `data-correct=/true|false/` — what the existing `author-activity-kinds.spec.ts`
 * does — proves a verdict happened, not which one, and cannot distinguish a
 * reducer that inverted its grading from one that did not. Freezing the spec
 * here is what turns "a verdict appeared" into "the RIGHT verdict appeared".
 *
 * It also makes the baseline immune to content edits: an author fixing a typo
 * in a real quiz must never look like a refactor regression.
 *
 * ## Spec shapes are REAL
 *
 * Every spec below is modelled on an actual `itera.activities` row (Itera DB
 * `kjefmwlopzeaqgqtlbdn`, read 2026-07-31) and must satisfy the same
 * `@iterahq/activity-spec` Zod schema the app validates with at the render
 * boundary (`src/utils/activitySpecBoundary.ts`). A fixture that failed its
 * schema would render `<InvalidSpecCard>` and the test would be characterizing
 * the error card instead of the kind — `spec-boundary` guards against exactly
 * that by asserting no `*-invalid` card is on screen.
 */

import sandboxScenarioSpec from './fixtures/sandbox-scenario.spec.json' with { type: 'json' };
import terminalScenarios from './fixtures/terminal-scenarios.spec.json' with { type: 'json' };

/** Ids are STABLE and arbitrary — the stub resolves the fixture by this id. */
export interface ActivityFixture {
  /** Stable uuid used in `/author/activities/:id/test`. */
  id: string;
  kind: string;
  /** Human label for the test title. */
  label: string;
  spec: Record<string, unknown>;
  rubric?: Record<string, unknown>;
  status?: 'draft' | 'published' | 'done';
  artifactPolicy?: Record<string, unknown>;
}

const id = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

/* ────────────────────────────────────────────────────────────────────────────
 * EXPOSITION KINDS — no answer key. Reaching the verdict IS the behaviour.
 * ──────────────────────────────────────────────────────────────────────────── */

export const CONCEPT: ActivityFixture = {
  id: id(1),
  kind: 'concept',
  label: 'concept',
  spec: {
    instruction: { text: 'Um commit é uma foto do projeto num instante.' },
    body: 'O Git guarda cada commit como um instantâneo completo da árvore.',
  },
};

/**
 * ⚠️ NOTE THE ABSENT `prompt`. `DocumentActivity` takes the REFLECTION branch
 * whenever `spec.prompt` is truthy OR `rubric.min_words > 0`, so a spec with
 * only `title`/`body` is the one and only shape that reaches the plain
 * read-only screen. Adding a `prompt` here silently changes which screen this
 * fixture characterizes.
 */
export const DOCUMENT_READONLY: ActivityFixture = {
  id: id(2),
  kind: 'document',
  label: 'document (somente leitura)',
  spec: {
    title: 'Versionamento',
    body: 'Versionar é registrar decisões, não apenas arquivos.',
  },
};

/**
 * STRUCTURAL VARIANT — a `min_words` rubric turns the same kind into a
 * reflection with a textarea and a word-count gate. Different screen, different
 * state machine: it is the only `document` shape that can be BLOCKED.
 */
export const DOCUMENT_REFLECTION: ActivityFixture = {
  id: id(3),
  kind: 'document',
  label: 'document (reflexão, rubric.min_words)',
  spec: { prompt: 'Escreva o que você entendeu sobre merge.' },
  rubric: { min_words: 10 },
};

export const DIAGRAM: ActivityFixture = {
  id: id(4),
  kind: 'diagram',
  label: 'diagram',
  spec: {
    prompt: 'Observe o fluxo de branches.',
    mermaid: 'graph TD;\n  main-->feature;\n  feature-->main;',
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * GRADED KINDS — the answer key is authored here, so acerto/erro are decidable.
 * ──────────────────────────────────────────────────────────────────────────── */

export const QUIZ: ActivityFixture = {
  id: id(5),
  kind: 'quiz',
  label: 'quiz (2 opções)',
  spec: {
    prompt: 'Quando dá conflito, o Git escolhe sozinho a versão mais recente.',
    options: [
      { id: 'v', text: 'VERDADEIRO', isCorrect: false },
      { id: 'f', text: 'FALSO', isCorrect: true },
    ],
    explanation: 'Falso — o Git para o merge e pergunta.',
  },
};

export const SINGLE_CHOICE: ActivityFixture = {
  id: id(6),
  kind: 'single_choice',
  label: 'single_choice',
  spec: {
    instruction: { text: 'No React, pra que serve o useState?' },
    options: [
      { id: 'a', label: 'Guardar uma informação que muda na tela' },
      { id: 'b', label: 'Mudar a cor do computador' },
      { id: 'c', label: 'Instalar programas novos' },
    ],
    correct_option_id: 'a',
  },
};

export const MULTI_CHOICE: ActivityFixture = {
  id: id(7),
  kind: 'multi_choice',
  label: 'multi_choice',
  spec: {
    instruction: { text: 'Marque todas as frases verdadeiras sobre o Git.' },
    options: [
      { id: 'a', label: 'O Git só registra quando eu mando registrar' },
      { id: 'b', label: 'Um commit colado no histórico não some sozinho' },
      { id: 'c', label: 'Em conflito, o Git para e pergunta' },
      { id: 'd', label: 'O Git salva sozinho de minuto em minuto' },
    ],
    correct_option_ids: ['a', 'b', 'c'],
  },
};

export const MATCH: ActivityFixture = {
  id: id(8),
  kind: 'match',
  label: 'match',
  spec: {
    instruction: { text: 'Relacione cada comando ao que ele faz.' },
    left: [
      { id: 'p1', label: 'git commit' },
      { id: 'p2', label: 'git branch' },
    ],
    right: [
      { id: 'r1', label: 'registra uma mudança' },
      { id: 'r2', label: 'cria uma linha paralela' },
    ],
    pairs: [
      { left_id: 'p1', right_id: 'r1' },
      { left_id: 'p2', right_id: 'r2' },
    ],
  },
};

export const ORDER: ActivityFixture = {
  id: id(9),
  kind: 'order',
  label: 'order',
  spec: {
    instruction: { text: 'Coloque os passos na ordem correta.' },
    items: [
      { id: 'i1', label: 'editar o arquivo' },
      { id: 'i2', label: 'git add' },
      { id: 'i3', label: 'git commit' },
    ],
    correct_order: ['i1', 'i2', 'i3'],
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * KINDS WITH HEAVY SUBSTRATE — see the spec file for how far each is driven.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * STRUCTURAL VARIANT A — `code` WITHOUT `checks`. Pre-0.5.0 shape: no grading,
 * the learner reads, edits and clicks Done. There is no incorrect path at all.
 */
export const CODE_NO_CHECKS: ActivityFixture = {
  id: id(10),
  kind: 'code',
  label: 'code (sem checks)',
  spec: {
    prompt: 'Renderize um título na tela.',
    language: 'tsx',
    starter: 'export default function App() {\n  return <h1 id="titulo">Olá</h1>;\n}\n',
  },
};

/**
 * STRUCTURAL VARIANT B — `code` WITH `checks`: a different screen (a criteria
 * list + a graded submit) and a genuinely gradeable state machine.
 *
 * The starter ALREADY satisfies the check, so the correct path never touches
 * Monaco. That is deliberate: typing into a lazily-mounted Monaco instance is
 * the single flakiest thing this suite could do, and the behaviour under
 * characterization is the CHECK RUNNER, not the editor. Checks are evaluated
 * against the rendered DOM of the sandboxed preview, 100% client-side (ADR-12),
 * so this stays hermetic.
 */
export const CODE_WITH_CHECKS: ActivityFixture = {
  id: id(11),
  kind: 'code',
  label: 'code (com checks — starter PASSA)',
  spec: {
    prompt: 'Renderize um título com o texto "Olá".',
    language: 'tsx',
    starter: 'export default function App() {\n  return <h1 id="titulo">Olá</h1>;\n}\n',
    checks: [
      {
        id: 'c1',
        label: 'Existe um <h1 id="titulo"> com o texto "Olá"',
        selector: '#titulo',
        assert: { type: 'text', equals: 'Olá' },
      },
    ],
  },
};

/**
 * STRUCTURAL VARIANT C — same screen as B, but the starter FAILS its check.
 * This is how `code` gets an incorrect path without driving the editor.
 */
export const CODE_WITH_FAILING_CHECKS: ActivityFixture = {
  id: id(15),
  kind: 'code',
  label: 'code (com checks — starter FALHA)',
  spec: {
    prompt: 'Renderize um título com o texto "Olá".',
    language: 'tsx',
    starter: 'export default function App() {\n  return <h1 id="titulo">Tchau</h1>;\n}\n',
    checks: [
      {
        id: 'c1',
        label: 'Existe um <h1 id="titulo"> com o texto "Olá"',
        selector: '#titulo',
        assert: { type: 'text', equals: 'Olá' },
      },
    ],
  },
};

/**
 * ⚠️ `video` has **ZERO rows** in `itera.activities` (verified 2026-07-31). This
 * fixture is therefore the ONLY thing that has ever exercised the kind — see
 * the spec file's note. It is included because the renderer implements it and
 * the refactor can break it; it is flagged because no authored content backs it.
 */
export const VIDEO: ActivityFixture = {
  id: id(12),
  kind: 'video',
  label: 'video (ZERO instâncias reais)',
  spec: {
    instruction: { text: 'Assista ao vídeo introdutório.' },
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
};

/**
 * A REAL `sandbox_scenario` spec, copied verbatim out of `itera.activities`
 * (2026-07-31) and frozen here. Hand-authoring one is not realistic — the
 * schema cross-validates step ids, unlock predicates and `resultResolver` keys
 * against `cannedResults` — and a hand-made minimal one would characterize a
 * shape no author ever produces. Two steps (`compose` then `evaluate`), the
 * smallest `openness: 'fixed'` scenario in the catalogue.
 */
export const SANDBOX_SCENARIO: ActivityFixture = {
  id: id(13),
  kind: 'sandbox_scenario',
  label: 'sandbox_scenario (spec real, 2 passos)',
  spec: sandboxScenarioSpec as unknown as Record<string, unknown>,
};

/* ────────────────────────────────────────────────────────────────────────────
 * TERMINAL SANDBOXES — the SAME kind (`sandbox_scenario`) with
 * `sandboxKind: "terminal"`, one per input surface. Both specs are copied
 * verbatim from the package's own conformance corpus
 * (`@iterahq/activity-spec:src/schemas/fixtures/terminal-scenarios.ts`, mirrored
 * in `src/test/fixtures/terminal-scenarios.json`), so what the browser drives
 * here is what the package replays — not a second, hand-made shape that could
 * agree with nothing.
 *
 * They exist for `e2e/terminal-sandbox.spec.ts`, which asserts the things only a
 * real browser can see: layout geometry, the success marker, and the rendered
 * locale. `activity-baseline.spec.ts` deliberately does NOT drive them — that
 * suite is frozen characterization and these assertions are about behaviour we
 * are actively changing.
 * ──────────────────────────────────────────────────────────────────────────── */

export const TERMINAL_FREE_TEXT: ActivityFixture = {
  id: id(18),
  kind: 'sandbox_scenario',
  label: 'sandbox_scenario · terminal (texto livre)',
  spec: terminalScenarios.freeText as unknown as Record<string, unknown>,
};

export const TERMINAL_OPTIONS: ActivityFixture = {
  id: id(19),
  kind: 'sandbox_scenario',
  label: 'sandbox_scenario · terminal (opções)',
  spec: terminalScenarios.options as unknown as Record<string, unknown>,
};

/* ────────────────────────────────────────────────────────────────────────────
 * INVALID SPECS — estado F. A mal-authored spec must render the friendly card,
 * never crash the learner's screen. One per validation SITE, because the two
 * sites produce different testids and different i18n keys.
 * ──────────────────────────────────────────────────────────────────────────── */

/** `site: 'boundary'` — caught in `ActivityRenderer` before the kind switch. */
export const INVALID_SINGLE_CHOICE: ActivityFixture = {
  id: id(16),
  kind: 'single_choice',
  label: 'single_choice (spec inválido — fronteira)',
  // `correct_option_id` references an id that no option has: the schema's
  // `superRefine` rejects it. A shape that is *almost* right is the realistic
  // authoring mistake, and it is the one a bare `z.object` would let through.
  spec: {
    options: [
      { id: 'a', label: 'primeira' },
      { id: 'b', label: 'segunda' },
    ],
    correct_option_id: 'inexistente',
  },
};

/** `site: 'component'` — caught inside `CodeSnackActivity`, own testid + message. */
export const INVALID_CODE: ActivityFixture = {
  id: id(17),
  kind: 'code',
  label: 'code (spec inválido — componente)',
  // `prompt` is REQUIRED by `CodeSpecSchema`.
  spec: { language: 'tsx', starter: 'export default () => null;' },
};

export const CONCEPT_REVEAL: ActivityFixture = {
  id: id(14),
  kind: 'concept_reveal',
  label: 'concept_reveal',
  spec: {
    instruction: { text: 'Uma **chave estrangeira** aponta para a linha de outra tabela.' },
    reveal: {
      prompt: 'Se um aluno pode pegar vários livros, onde mora a chave estrangeira?',
      answer: 'Na tabela de empréstimos — o lado que se repete guarda o apontador.',
    },
  },
};

/** Everything the stub must be able to resolve. */
export const ALL_FIXTURES: readonly ActivityFixture[] = [
  CONCEPT,
  DOCUMENT_READONLY,
  DOCUMENT_REFLECTION,
  DIAGRAM,
  QUIZ,
  SINGLE_CHOICE,
  MULTI_CHOICE,
  MATCH,
  ORDER,
  CODE_NO_CHECKS,
  CODE_WITH_CHECKS,
  CODE_WITH_FAILING_CHECKS,
  VIDEO,
  SANDBOX_SCENARIO,
  TERMINAL_FREE_TEXT,
  TERMINAL_OPTIONS,
  INVALID_SINGLE_CHOICE,
  INVALID_CODE,
  CONCEPT_REVEAL,
];
