/**
 * Fixtures de Storybook organizadas POR CONTRATO de activity.
 *
 * O que define uma activity NÃO é o componente que a renderiza — é o CONTRATO
 * (o `spec`, mais o `rubric` quando ele muda o renderer) que a ferramenta de
 * autoria precisa entregar. Logo:
 *
 *   - contrato diferente  → entrada própria aqui + story própria no Storybook;
 *   - variação do MESMO contrato (com/sem imagem, 2 vs. 4 opções, respondida vs.
 *     em branco) → é VARIANTE da mesma story, não entra aqui como contrato novo.
 *
 * Cada entrada declara também a FUNÇÃO pedagógica, que é como o Storybook
 * agrupa as stories na sidebar (`Organisms/Activities/<n · Função>/<Contrato>`).
 *
 * Validação: `src/test/activityContractFixtures.test.ts` roda
 * `safeParseActivitySpec(kind, spec)` em toda entrada com `validated: true`.
 * As exceções estão anotadas caso a caso (ver `validated: false`).
 */
import type { ActivityKind } from '@/types/content';
import scenarios from '@/test/fixtures/sandbox-scenarios.json';
import { SAMPLE_AUDIO, SAMPLE_IMAGE, SAMPLE_IMAGE_A, SAMPLE_IMAGE_B, SAMPLE_IMAGE_C, SAMPLE_VIDEO } from './activityFixtures';

/** As funções pedagógicas — a camada de agrupamento da sidebar do Storybook. */
export type ActivityFunction =
  | '1 · Exposição'
  | '2 · Escolha'
  | '3 · Associação'
  | '4 · Ordenação'
  | '5 · Produção'
  | '6 · Cenário com IA';

export interface ContractFixture {
  /** O `kind` do enum `itera.activity_kind` que a autoria grava na row. */
  kind: ActivityKind;
  /** Função pedagógica → o grupo da sidebar. */
  fn: ActivityFunction;
  /** Rótulo humano do contrato (o nó folha da sidebar). */
  label: string;
  /** O spec canônico deste contrato. */
  spec: Record<string, unknown>;
  /** Metadata de correção, quando ela faz parte do contrato (document). */
  rubric?: Record<string, unknown>;
  /** false = o spec NÃO passa (nem deve passar) no schema Zod do kind — ver `note`. */
  validated: boolean;
  /** Por que este contrato existe / o que ele exige da autoria. */
  note: string;
}

const bySlug = scenarios as Record<string, Record<string, unknown>>;

/* ------------------------------------------------------------------ *
 * 1 · Exposição — o aluno consome conteúdo e marca como concluído.
 * ------------------------------------------------------------------ */

export const CONCEPT_SPEC = {
  instruction: {
    text: 'Um modelo de dados descreve como as informações se relacionam entre si.',
    image_url: SAMPLE_IMAGE,
  },
};

export const VIDEO_SPEC = {
  video_url: SAMPLE_VIDEO,
  instruction: { text: 'Assista à introdução ao modelo relacional.' },
};

/** `diagram` é stub loose no Zod — o contrato real é o que o renderer lê. */
export const DIAGRAM_MERMAID_SPEC = {
  prompt: 'Leia o diagrama do clube de leitura da escola.',
  mermaid: [
    'erDiagram',
    '  ALUNO ||--o{ EMPRESTIMO : faz',
    '  LIVRO ||--o{ EMPRESTIMO : aparece_em',
    '  ALUNO {',
    '    uuid id PK',
    '    text nome',
    '  }',
    '  LIVRO {',
    '    uuid id PK',
    '    text titulo',
    '  }',
  ].join('\n'),
};

/** `document` SEM prompt e SEM rubric → leitura pura (só "marcar concluída"). */
export const DOCUMENT_READING_SPEC = {
  title: 'Como organizar seus estudos da semana',
  body: [
    'Separar o conteúdo em blocos curtos ajuda o cérebro a fixar melhor.',
    '',
    'Escolha três blocos de 25 minutos por dia e deixe 5 minutos de pausa entre eles.',
    'No fim da semana, releia suas anotações: o que você não conseguir explicar em uma',
    'frase provavelmente ainda precisa de uma segunda passada.',
  ].join('\n'),
};

/* ------------------------------------------------------------------ *
 * BORDAS — dois registros DELIBERADAMENTE separados.
 *
 * Nenhum dos dois é contrato novo (não entram no `ACTIVITY_CONTRACTS`): são
 * VARIAÇÕES do mesmo contrato, no extremo em que a autoria deixou um campo de
 * fora. É aqui que o invariante do Tainan ("metadata confiável ⇒ nunca falha")
 * de fato aperta. O que separa os dois registros é o VEREDITO DO ZOD — e a
 * classificação não é afirmada em prosa: `activityContractFixtures.test.ts`
 * roda `safeParseActivitySpec` em cada entrada e falha se ela mudar de lado.
 * ------------------------------------------------------------------ */

/**
 * EIXO H — spec que o Zod do kind ACEITA, mas que está no extremo degenerado:
 * o campo opcional simplesmente não veio. O renderer tem que degradar sem
 * quebrar. Este é o caso "metadata confiável" da fala do Tainan.
 */
export const DEGENERATE_SPECS = {
  document_vazio: {
    kind: 'document' as ActivityKind,
    spec: {},
    note: 'sem `prompt` e sem `body` → leitura pura de um documento vazio.',
  },
  diagram_sem_fonte: {
    kind: 'diagram' as ActivityKind,
    spec: { prompt: 'Diagrama ainda não anexado pela autoria.' },
    note: 'sem `mermaid` e sem `imageUrl` → só o enunciado.',
  },
  single_choice_sem_enunciado: {
    kind: 'single_choice' as ActivityKind,
    spec: {
      options: [
        { id: 'a', label: 'Chave primária' },
        { id: 'b', label: 'Chave estrangeira' },
      ],
      correct_option_id: 'b',
    },
    note: '`instruction` é opcional → opções sem enunciado nenhum.',
  },
  multi_choice_sem_enunciado: {
    kind: 'multi_choice' as ActivityKind,
    spec: {
      options: [
        { id: 'a', label: 'Normalizar' },
        { id: 'b', label: 'Duplicar tudo' },
        { id: 'c', label: 'Usar FK' },
      ],
      correct_option_ids: ['a', 'c'],
    },
    note: '`instruction` é opcional → opções sem enunciado nenhum.',
  },
  match_sem_enunciado: {
    kind: 'match' as ActivityKind,
    spec: {
      left: [{ id: 'pk', label: 'Chave primária' }],
      right: [{ id: 'r-pk', label: 'Identifica unicamente uma linha' }],
      pairs: [{ left_id: 'pk', right_id: 'r-pk' }],
    },
    note: '`instruction` é opcional → um par só, sem enunciado.',
  },
  order_sem_enunciado: {
    kind: 'order' as ActivityKind,
    spec: {
      items: [
        { id: 'a', label: '1. Identificar entidades' },
        { id: 'b', label: '2. Listar atributos' },
      ],
      correct_order: ['a', 'b'],
    },
    note: '`instruction` é opcional → dois itens, sem enunciado.',
  },
} as const;

/**
 * EIXO F′ — spec que o Zod do kind REJEITA e que, mesmo assim, CHEGA no
 * renderer.
 *
 * ⚠️ Não é hipótese: `safeParseActivitySpec` só é chamado em 2 dos 11 kinds
 * (`code` e `sandbox_scenario`) — ADR-5 / ADR-13 / drift signal #3 do plano. Nos
 * outros 9 o `spec` entra por cast, então um spec inválido nunca é barrado e vai
 * direto para a árvore de render. As duas entradas abaixo são exatamente isso,
 * verificadas: o schema diz NÃO e o componente monta um fallback amigável.
 *
 * Elas existem para que o dia em que a fronteira de validação for fechada (é do
 * plano irmão `20260728-itera-back-office`) essas stories mudem de significado
 * de propósito — e o guard avise, porque a asserção "o Zod rejeita" vai deixar
 * de valer junto com o caminho que a produz.
 */
export const UNGUARDED_INVALID_SPECS = {
  video_sem_url: {
    kind: 'video' as ActivityKind,
    spec: { instruction: { text: 'A autoria publicou esta activity sem anexar o vídeo.' } },
    note: '`video_url` é OBRIGATÓRIO no Zod; o kind não valida → cai no aviso "vídeo indisponível".',
  },
  concept_sem_instrucao: {
    kind: 'concept' as ActivityKind,
    spec: {},
    note: '`instruction` é OBRIGATÓRIA no Zod; o kind não valida → sobra o shell do concept.',
  },
  sandbox_lixo: {
    kind: 'sandbox_scenario' as ActivityKind,
    spec: { nope: 1 },
    note: 'ESTE é barrado: sandbox_scenario valida → card `sandbox-invalid` em vez de crash.',
    guarded: true,
  },
} as const;

/* ------------------------------------------------------------------ *
 * 2 · Escolha — o aluno seleciona entre opções fechadas.
 * ------------------------------------------------------------------ */

export const SINGLE_CHOICE_SPEC = {
  instruction: { text: 'Qual estrutura evita duplicar dados entre tabelas?' },
  options: [
    { id: 'a', label: 'Copiar as colunas para cada tabela' },
    { id: 'b', label: 'Usar uma chave estrangeira (FK)' },
    { id: 'c', label: 'Duplicar a tabela inteira' },
  ],
  correct_option_id: 'b',
};

/** Variação do MESMO contrato: as opções carregam imagem em vez de só texto. */
export const SINGLE_CHOICE_IMAGE_SPEC = {
  instruction: { text: 'Qual imagem representa um relacionamento 1:N?' },
  options: [
    { id: 'a', label: 'Opção A', image_url: SAMPLE_IMAGE_A },
    { id: 'b', label: 'Opção B', image_url: SAMPLE_IMAGE_B },
    { id: 'c', label: 'Opção C', image_url: SAMPLE_IMAGE_C },
  ],
  correct_option_id: 'c',
};

export const MULTI_CHOICE_SPEC = {
  instruction: { text: 'Quais são boas práticas de modelagem relacional?' },
  options: [
    { id: 'a', label: 'Normalizar para evitar redundância' },
    { id: 'b', label: 'Usar chaves estrangeiras para relações' },
    { id: 'c', label: 'Copiar dados entre todas as tabelas' },
    { id: 'd', label: 'Definir chaves primárias' },
  ],
  correct_option_ids: ['a', 'b', 'd'],
};

/**
 * `quiz` é um contrato SEPARADO de single_choice, não uma variação dele: a
 * correção vem de `options[].isCorrect` (e não de um `correct_option_id`), o
 * enunciado é `question`/`prompt` (e não um InstructionPanel), e ele aceita
 * `label` (a tarja) + `explanation` (o pós-resposta). Stub loose no Zod — o
 * contrato abaixo foi montado a partir do que o `QuizActivity` de fato lê.
 */
export const QUIZ_TRUE_FALSE_SPEC = {
  question: 'Uma chave primária pode se repetir em duas linhas da mesma tabela.',
  options: [
    { id: 'v', text: 'Verdadeiro', isCorrect: false },
    { id: 'f', text: 'Falso', isCorrect: true },
  ],
  explanation: 'A chave primária identifica a linha de forma única — ela nunca se repete.',
};

/* ------------------------------------------------------------------ *
 * 3 · Associação — o aluno liga itens de dois conjuntos.
 * ------------------------------------------------------------------ */

export const MATCH_SPEC = {
  instruction: { text: 'Associe cada termo à sua definição.' },
  left: [
    { id: 'pk', label: 'Chave primária' },
    { id: 'fk', label: 'Chave estrangeira' },
    { id: 'idx', label: 'Índice' },
  ],
  right: [
    { id: 'r-idx', label: 'Acelera buscas por coluna' },
    { id: 'r-pk', label: 'Identifica unicamente uma linha' },
    { id: 'r-fk', label: 'Referencia a PK de outra tabela' },
  ],
  pairs: [
    { left_id: 'pk', right_id: 'r-pk' },
    { left_id: 'fk', right_id: 'r-fk' },
    { left_id: 'idx', right_id: 'r-idx' },
  ],
};

/* ------------------------------------------------------------------ *
 * 4 · Ordenação — o aluno coloca uma sequência embaralhada em ordem.
 * ------------------------------------------------------------------ */

export const ORDER_SPEC = {
  instruction: { text: 'Ordene as etapas de modelagem de dados.' },
  items: [
    { id: 's3', label: '3. Normalizar as tabelas' },
    { id: 's1', label: '1. Identificar as entidades' },
    { id: 's4', label: '4. Definir chaves e relações' },
    { id: 's2', label: '2. Listar os atributos' },
  ],
  correct_order: ['s1', 's2', 's3', 's4'],
};

/* ------------------------------------------------------------------ *
 * 5 · Produção — o aluno cria algo (texto ou código).
 * ------------------------------------------------------------------ */

/**
 * `document` COM prompt (e/ou `rubric.min_words`) → redação: o renderer troca o
 * "marcar concluída" por um textarea real com contador de palavras. Mesmo
 * `kind`, mesmo schema de spec — mas a metadata (o prompt/rubric) é o que a
 * autoria precisa passar, e ela muda o renderer. Por isso é um contrato à parte
 * do `DOCUMENT_READING_SPEC`.
 */
export const DOCUMENT_WRITING_SPEC = {
  prompt: 'Escreva, com suas palavras, o que você entendeu sobre chaves primárias.',
  body: 'Vale citar um exemplo do seu dia a dia — número de matrícula, CPF, e-mail…',
};

export const DOCUMENT_WRITING_RUBRIC = { min_words: 30 };

/**
 * `code` — snack React de arquivo único. ATENÇÃO: o preview roda num iframe
 * `sandbox="allow-scripts"` autossuficiente, SEM `require`/bundler: `React` e os
 * hooks chegam como GLOBAIS injetados. Por isso o `starter` não pode ter
 * `import` — só `export default`.
 */
export const CODE_STARTER = `export default function Contador() {
  const [curtidas, setCurtidas] = useState(0);

  return (
    <div className="rounded-xl border border-slate-200 p-6 text-center">
      <h1 className="text-xl font-bold text-slate-800">Clube de leitura</h1>
      <p className="mt-2 text-slate-600">
        Clique no botão para registrar quem gostou do livro da semana.
      </p>
      <button
        onClick={() => setCurtidas(curtidas + 1)}
        className="mt-4 rounded-full bg-emerald-600 px-5 py-2 font-medium text-white"
      >
        Gostei: {curtidas}
      </button>
    </div>
  );
}
`;

export const CODE_SPEC = {
  prompt: 'Mude o texto do botão e a cor de fundo. O preview atualiza sozinho.',
  starter: CODE_STARTER,
  language: 'tsx',
};

/* ------------------------------------------------------------------ *
 * 6 · Cenário com IA — o aluno conversa com uma IA dentro de um roteiro.
 * ------------------------------------------------------------------ */

/** Sem `slots` nem `choices` → compose livre (SandboxAI). */
export const SANDBOX_OPEN_SPEC = bySlug.cIA;
/** Com `choices` → o aluno escolhe UM chip de contexto (SandboxAIWithOptions). */
export const SANDBOX_CHOICES_SPEC = bySlug.c1;
/** Com `slots` → o aluno preenche lacunas do prompt (SandboxAICompleteWords). */
export const SANDBOX_SLOTS_SPEC = bySlug.c6;

/**
 * BYOC ao vivo — contrato PRÓPRIO: `openness: 'byoc'` (ou `live: true`) e nada
 * de `initialState`/`cannedResults`, porque a resposta vem de um LLM real em vez
 * de uma tabela determinística. Ele é reconhecido por `isByocLive()`, NÃO pelo
 * `SandboxScenarioSpecSchema` — daí `validated: false` abaixo.
 */
export const SANDBOX_BYOC_SPEC = {
  openness: 'byoc',
  title: { pt: 'Contexto muda tudo', en: 'Context changes everything' },
  prompt: {
    pt: 'Traga seu contexto e envie — a IA vai responder de verdade.',
    en: 'Bring your context and send — the AI will really respond.',
  },
};

/* ------------------------------------------------------------------ *
 * O registro — uma entrada por CONTRATO.
 * ------------------------------------------------------------------ */

export const ACTIVITY_CONTRACTS = {
  concept: {
    kind: 'concept',
    fn: '1 · Exposição',
    label: 'Concept',
    spec: CONCEPT_SPEC,
    validated: true,
    note: '{ instruction } — só o InstructionPanel; sem interação além de concluir.',
  },
  video: {
    kind: 'video',
    fn: '1 · Exposição',
    label: 'Video',
    spec: VIDEO_SPEC,
    validated: true,
    note: '{ video_url, instruction? } — vídeo obrigatório, contexto opcional.',
  },
  diagram: {
    kind: 'diagram',
    fn: '1 · Exposição',
    label: 'Diagram',
    spec: DIAGRAM_MERMAID_SPEC,
    validated: true,
    note: '{ prompt, mermaid? | imageUrl? } — stub loose no Zod; forma lida do renderer.',
  },
  document_reading: {
    kind: 'document',
    fn: '1 · Exposição',
    label: 'Document (leitura)',
    spec: DOCUMENT_READING_SPEC,
    validated: true,
    note: '{ title?, body } SEM prompt e SEM rubric → leitura pura.',
  },
  single_choice: {
    kind: 'single_choice',
    fn: '2 · Escolha',
    label: 'SingleChoice',
    spec: SINGLE_CHOICE_SPEC,
    validated: true,
    note: '{ instruction?, options[], correct_option_id } — exatamente uma correta.',
  },
  single_choice_images: {
    kind: 'single_choice',
    fn: '2 · Escolha',
    label: 'SingleChoice (opções com imagem)',
    spec: SINGLE_CHOICE_IMAGE_SPEC,
    validated: true,
    note: 'MESMO contrato do single_choice — ter imagem é variação, não activity nova.',
  },
  multi_choice: {
    kind: 'multi_choice',
    fn: '2 · Escolha',
    label: 'MultiChoice',
    spec: MULTI_CHOICE_SPEC,
    validated: true,
    note: '{ instruction?, options[], correct_option_ids[] } — acerta quem marca o CONJUNTO exato.',
  },
  quiz: {
    kind: 'quiz',
    fn: '2 · Escolha',
    label: 'Quiz',
    spec: QUIZ_TRUE_FALSE_SPEC,
    validated: true,
    note: '{ question|prompt, label?, options[{ text|label, isCorrect }], explanation? } — correção inline na opção.',
  },
  match: {
    kind: 'match',
    fn: '3 · Associação',
    label: 'Match',
    spec: MATCH_SPEC,
    validated: true,
    note: '{ instruction?, left[], right[], pairs[] } — pairs referenciam os ids dos dois lados.',
  },
  order: {
    kind: 'order',
    fn: '4 · Ordenação',
    label: 'Order',
    spec: ORDER_SPEC,
    validated: true,
    note: '{ instruction?, items[], correct_order[] } — correct_order é permutação de items[].id.',
  },
  document_writing: {
    kind: 'document',
    fn: '5 · Produção',
    label: 'Document (redação)',
    spec: DOCUMENT_WRITING_SPEC,
    rubric: DOCUMENT_WRITING_RUBRIC,
    validated: true,
    note: '{ prompt, body? } + rubric { min_words } → textarea com contador; renderer diferente do de leitura.',
  },
  code: {
    kind: 'code',
    fn: '5 · Produção',
    label: 'Code',
    spec: CODE_SPEC,
    validated: true,
    note: '{ prompt, starter?, language, help? } — starter SEM import (o iframe não tem require).',
  },
  sandbox_open: {
    kind: 'sandbox_scenario',
    fn: '6 · Cenário com IA',
    label: 'Sandbox · IA aberta',
    spec: SANDBOX_OPEN_SPEC,
    validated: true,
    note: 'Scenario sem slots nem choices → o aluno manda o basePrompt como está.',
  },
  sandbox_choices: {
    kind: 'sandbox_scenario',
    fn: '6 · Cenário com IA',
    label: 'Sandbox · Contexto por opções',
    spec: SANDBOX_CHOICES_SPEC,
    validated: true,
    note: 'Scenario com `choices[]` → o aluno acrescenta contexto escolhendo UM chip.',
  },
  sandbox_slots: {
    kind: 'sandbox_scenario',
    fn: '6 · Cenário com IA',
    label: 'Sandbox · Completar palavras',
    spec: SANDBOX_SLOTS_SPEC,
    validated: true,
    note: 'Scenario com `slots[]` → o aluno monta o prompt preenchendo lacunas.',
  },
  sandbox_byoc_live: {
    kind: 'sandbox_scenario',
    fn: '6 · Cenário com IA',
    label: 'Sandbox · BYOC ao vivo',
    spec: SANDBOX_BYOC_SPEC,
    validated: false,
    note: 'openness:"byoc" + LLM real; reconhecido por isByocLive(), NÃO pelo SandboxScenarioSpecSchema.',
  },
} as const satisfies Record<string, ContractFixture>;

export type ContractKey = keyof typeof ACTIVITY_CONTRACTS;

/** Só para reexportar de um lugar só nas stories novas. */
export { SAMPLE_AUDIO, SAMPLE_IMAGE, SAMPLE_IMAGE_A, SAMPLE_IMAGE_B, SAMPLE_IMAGE_C, SAMPLE_VIDEO };
