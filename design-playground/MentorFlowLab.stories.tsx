/**
 * Design Playground — Fluxo Mentor IA (protótipo).
 *
 * Uma jornada INQUISITIVA em 3 etapas onde a IA atua como mentora e
 * VALIDADORA: em vez de despejar conteúdo, ela nivela, direciona e valida —
 * e a mecânica central é o aluno ESCOLHER (e aprender a fazer) as perguntas
 * certas. Conteúdo de exemplo: editais de fomento e recurso.
 *
 *   1. Learning Outside–Inward  — perguntas niveladoras nos essenciais,
 *      de fora pra dentro (o que é, como funciona, o que se repete).
 *   2. The Core Fundamentals    — chatbot-style: perguntas específicas com
 *      dicas e microcopy (documentação, validação, defesa do objetivo).
 *   3. The Intersections        — conectar o tópico a contextos vizinhos
 *      (edital × financiamento bancário) e sair com a próxima boa pergunta.
 *
 * Mecânica: feed de chat (mentor à esquerda, aluno à direita) + um cartão
 * interativo ativo ao pé do feed. Passos são DADOS (array tipado); o engine
 * é genérico — trocar o assunto = trocar o array. Gamificação: XP por acerto
 * de primeira, contagem de "boas perguntas", recap final.
 *
 * Dois reforços inquisitivos:
 *   · Intro = CONSTRUTOR DE PROMPT guiado: três perguntas norteadoras
 *     ("do que" = situação real; "como" = ponto de partida + objetivo de uso)
 *     montam o prompt ao vivo, com checklist de anatomia do bom prompt.
 *   · Passo 'build' (Monte sua pergunta): word-bank estilo Duolingo — o aluno
 *     COMPÕE a pergunta peça por peça (com distratores). Perguntar vale mais
 *     XP que responder; a conclusão devolve as perguntas como prompts prontos.
 *
 * Playground-only (src/stories/) — nada disto entra no bundle do app.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Compass,
  Target,
  GitMerge,
  Zap,
  Lightbulb,
  MessageCircleQuestion,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Trophy,
  RotateCcw,
  X,
  ArrowLeftRight,
  Puzzle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ────────────────────────────── Step model ──────────────────────────────── */

interface AskOption {
  label: string;
  good?: boolean;
  /** Mentor microcopy validating (or gently redirecting) this question. */
  feedback: string;
}
interface QuizOption {
  label: string;
  correct?: boolean;
}
/** Peça-distrator do word-bank de 'build', com microcopy de redirecionamento. */
interface BuildExtra {
  label: string;
  feedback: string;
}

type Step =
  | { kind: 'mentor'; stage: number; text: string; bullets?: string[] }
  | { kind: 'ask'; stage: number; prompt: string; options: AskOption[]; mentorAnswer: string }
  | { kind: 'build'; stage: number; prompt: string; correct: string[]; extras: BuildExtra[]; mentorAnswer: string }
  | { kind: 'quiz'; stage: number; question: string; hint?: string; options: QuizOption[]; explain: string }
  | {
      kind: 'compare';
      stage: number;
      title: string;
      intro: string;
      rows: { aspect: string; edital: string; banco: string; similar: boolean }[];
    };

/** Per-stage color identity (todas dentro dos tokens do brand):
 *  etapa 1 = evergreen (nivelar) · etapa 2 = clay (o núcleo das perguntas
 *  específicas — clay é a cor de Q&A do brand) · etapa 3 = gelo (síntese). */
interface StageColors {
  text: string;
  border: string;
  bg: string;
  bar: string;
}

interface StageMeta {
  name: string;
  longName: string;
  hint: string;
  icon: LucideIcon;
  colors: StageColors;
  /** O que acontece na etapa (microcopy da tela inicial). */
  desc: string;
  /** Por que a etapa importa (microcopy da tela inicial). */
  why: string;
}

const STAGES: StageMeta[] = [
  {
    name: 'Outside–In',
    longName: 'Learning Outside–Inward',
    hint: 'Nivelando os essenciais',
    icon: Compass,
    colors: { text: 'text-evergreen-hi', border: 'border-evergreen/40', bg: 'bg-evergreen-soft', bar: 'bg-evergreen' },
    desc: '5 perguntas mapeiam o terreno: o que é, como funciona, o que se repete.',
    why: 'Sem nivelar, conteúdo avançado vira ruído.',
  },
  {
    name: 'Fundamentos',
    longName: 'The Core Fundamentals',
    hint: 'O núcleo técnico',
    icon: Target,
    colors: { text: 'text-clay', border: 'border-clay/40', bg: 'bg-clay/10', bar: 'bg-clay' },
    desc: 'O núcleo em conversa: perguntas específicas, com dicas cirúrgicas.',
    why: 'Aqui, conhecimento vira habilidade.',
  },
  {
    name: 'Interseções',
    longName: 'The Intersections',
    hint: 'Conectando contextos',
    icon: GitMerge,
    colors: { text: 'text-gelo', border: 'border-gelo/30', bg: 'bg-gelo/10', bar: 'bg-gelo/80' },
    desc: 'O tema se conecta ao que você já conhece — e aponta a próxima pergunta.',
    why: 'Conhecimento conectado é conhecimento que fica.',
  },
];

/* ─────────────── Construtor de prompt (intro norteadora) ────────────────── */

/** "COMO fazer o prompt" — ponto de partida: cada opção vira uma frase no
 *  prompt montado (echo), calibrando o nível das perguntas do mentor. */
const PARTIDAS = [
  { label: 'Nunca vi na prática', echo: 'Estou começando do zero.' },
  { label: 'Já ouvi falar', echo: 'Conheço por alto, ainda sem prática.' },
  { label: 'Já pratico um pouco', echo: 'Já tenho alguma prática e quero estruturar.' },
];

/** "DO QUE fazer o prompt" — situações reais de exemplo (clicar preenche).
 *  A primeira é o exemplo real de um colega do time, usado no fluxo ilustrado. */
const TEMA_IDEAS = [
  'o fluxo de editais para fomento e recurso',
  'como precificar meus serviços',
  'me preparar para uma entrevista de emprego',
];

/** Estado inicial pré-preenchido — o protótipo abre já com o exemplo vivo. */
const SAMPLE_TEMA = TEMA_IDEAS[0];
const SAMPLE_PARTIDA = 0;
const SAMPLE_OBJETIVO = 'captar recurso pela primeira vez com minha empresa pequena';

/** Monta o prompt final a partir das três respostas norteadoras. */
function assemblePrompt(tema: string, partida: number | null, objetivo: string): string {
  const parts = [`Quero aprender sobre ${tema.trim() || '…'}.`];
  if (partida !== null) parts.push(PARTIDAS[partida].echo);
  if (objetivo.trim()) parts.push(`Meu objetivo: ${objetivo.trim()}.`);
  return parts.join(' ');
}

/** Resumo do fluxo mostrado na conclusão — 1 síntese por etapa. */
const STAGE_SUMMARIES = [
  'O terreno: editais distribuem recurso com regras públicas e critérios claros. Os processos variam entre editais; a documentação converge.',
  'O núcleo: conheça a régua (critérios e pesos), escreva para a régua e prove cada afirmação com evidência. Documentação te mantém no jogo; aderência te faz vencer.',
  'As pontes: o mesmo kit documental e o mesmo argumento estruturado servem no financiamento bancário — o que muda é a régua de decisão (mérito público × risco de crédito).',
];

/** Vocabulário essencial do tema, consolidado na conclusão. */
const GLOSSARY: { term: string; def: string }[] = [
  { term: 'Edital', def: 'Chamada pública com regras, prazos e critérios para acessar recurso.' },
  { term: 'Fomento', def: 'Recurso para impulsionar projetos — normalmente não-reembolsável.' },
  { term: 'Habilitação documental', def: 'Checagem de conformidade dos documentos, antes do mérito.' },
  { term: 'Avaliação de mérito', def: 'Nota da proposta segundo os critérios e pesos do edital.' },
  { term: 'Certidões negativas', def: 'Provas de regularidade fiscal e trabalhista da empresa.' },
  { term: 'Kit documental', def: 'Docs societários + certidões + proposta; se repete entre editais.' },
  { term: 'Aderência', def: 'Alinhamento da proposta à temática e às áreas de interesse.' },
  { term: 'Critérios e pesos', def: 'A "régua" pública que pontua cada proposta.' },
  { term: 'Contrapartida', def: 'Parcela de recursos próprios exigida por alguns editais.' },
  { term: 'FINEP · BNDES · CNPq · FAPs', def: 'As grandes fontes públicas de fomento do país.' },
];

/* ─────────────────── Conteúdo: editais de fomento (exemplo) ─────────────── */

/** ⚠️ Teto de teste: NO MÁXIMO 5 perguntas (ask/quiz/build) por etapa — sessão
 *  curta o bastante pra rodar inteira em validação de fluxo. Ao adicionar um
 *  passo, troque outro da mesma etapa em vez de somar. */
const STEPS: Step[] = [
  // ═══ Etapa 1 — Learning Outside–Inward (5 perguntas niveladoras) ═══
  {
    kind: 'mentor',
    stage: 0,
    text: 'Oi! Eu sou seu mentor. Vamos aprender editais de fora pra dentro: panorama primeiro, núcleo depois. Meu papel é te ajudar a fazer as perguntas certas. Bora nivelar o essencial?',
  },
  {
    kind: 'ask',
    stage: 0,
    prompt: 'Você quer entender o fluxo de editais para fomento e recurso. Qual é a PRIMEIRA pergunta certa a fazer?',
    options: [
      { label: 'O que é um edital e pra que ele serve?', good: true, feedback: 'Boa! Começar pelo conceito é aprender de fora pra dentro.' },
      { label: 'Como preencho o orçamento do projeto?', feedback: 'Calma — orçamento é detalhe de dentro. Antes, entenda o terreno.' },
      { label: 'Qual edital paga mais?', feedback: 'Tentador, mas sem entender o jogo, o prêmio não ajuda. Comece mais aberto.' },
    ],
    mentorAnswer:
      'Edital é uma chamada pública: um documento que define QUEM pode pedir recurso, PARA QUÊ, com QUAIS regras e COMO será avaliado. Ele existe para distribuir dinheiro (público ou de fundos) com transparência — e, no caso do fomento, esse recurso normalmente NÃO se devolve. É essa a diferença de raiz para um banco.',
  },
  {
    kind: 'quiz',
    stage: 0,
    question: 'Então, na essência, um edital de fomento serve para…',
    options: [
      { label: 'Emprestar dinheiro com juros, como um banco' },
      { label: 'Distribuir recurso com regras públicas e critérios claros', correct: true },
      { label: 'Garantir recurso a quem se inscrever primeiro' },
    ],
    explain: 'Exato: regras públicas + critérios de avaliação. Não é empréstimo, nem fila por ordem de chegada.',
  },
  {
    kind: 'ask',
    stage: 0,
    prompt: 'Panorama mapeado. Qual é a próxima pergunta certa para afunilar?',
    options: [
      { label: 'Quais documentos praticamente todo edital pede?', good: true, feedback: 'Essa pergunta destrava MUITO: documentação é o que mais se repete entre editais.' },
      { label: 'Como recorrer se eu for desclassificado?', feedback: 'Importante, mas é o fim do funil. Ainda estamos mapeando o que é comum.' },
      { label: 'Qual fonte tem o processo mais rápido?', feedback: 'Processo varia caso a caso — é uma pergunta pouco generalizável agora.' },
    ],
    mentorAnswer:
      'Quase todo edital pede: documentos societários (CNPJ, contrato social), certidões negativas (fiscais e trabalhistas), comprovações de capacidade técnica e a proposta do projeto. Os PROCESSOS variam; a DOCUMENTAÇÃO tende a se repetir.',
  },
  {
    kind: 'quiz',
    stage: 0,
    question: 'Qual é a ordem típica das etapas de um edital?',
    options: [
      { label: 'Inscrição → habilitação documental → avaliação de mérito → resultado', correct: true },
      { label: 'Avaliação de mérito → inscrição → resultado' },
      { label: 'Resultado → inscrição → recurso' },
    ],
    explain:
      'Primeiro conferem se você PODE participar (habilitação documental: o pente-fino de conformidade); depois, se o projeto MERECE (mérito). Muita gente boa cai na primeira — por papel, não por ideia.',
  },
  {
    kind: 'build',
    stage: 0,
    prompt: 'Agora é você quem pergunta. Monte, peça por peça, a pergunta que revela o padrão central dos editais:',
    correct: ['O que se repete', 'em todo edital', '— e o que muda', 'de um pra outro?'],
    extras: [
      { label: 'paga mais rápido', feedback: 'Pergunta de atalho: sem entender o padrão, a resposta não te move.' },
      { label: 'na minha opinião', feedback: 'Opinião não mapeia terreno — pergunte pelo padrão observável.' },
    ],
    mentorAnswer:
      'Pergunta de mapeador! Processos e prazos mudam de edital pra edital; a documentação e a ordem das etapas (habilitação → mérito) se repetem. Quem enxerga esse padrão estuda uma vez e reaproveita sempre.',
  },

  // ═══ Etapa 2 — The Core Fundamentals (específico, com dicas) ═══
  {
    kind: 'mentor',
    stage: 1,
    text: 'Terreno nivelado. Agora repare onde os projetos caem: (1) habilitação — documento vencido ou faltando; (2) mérito — proposta desalinhada com a temática. É exatamente isso que vamos atacar agora, no núcleo: documentação, validação e DEFESA do objetivo. Aqui as perguntas ficam específicas — e as dicas, cirúrgicas.',
    bullets: [
      'Documentação: o que te mantém no jogo.',
      'Argumentação aderente à temática: o que te faz vencer.',
      'Validação: evidência para cada exigência.',
    ],
  },
  {
    kind: 'quiz',
    stage: 1,
    question: "No campo 'Objetivo do projeto', o avaliador de mérito procura principalmente…",
    hint: 'Releia a pergunta: o que o AVALIADOR procura — não o que você quer contar.',
    options: [
      { label: 'Alinhamento claro com a temática e as áreas de interesse do edital', correct: true },
      { label: 'Um texto longo e rebuscado' },
      { label: 'Promessas ambiciosas sem cronograma' },
    ],
    explain: 'O avaliador pontua ADERÊNCIA: objetivo bom conecta a sua necessidade à temática do edital, com cronograma e resultado mensurável.',
  },
  {
    kind: 'ask',
    stage: 1,
    prompt: 'Antes de escrever qualquer linha da proposta, qual pergunta você faz?',
    options: [
      { label: 'Quais são os critérios e os pesos da avaliação de mérito?', good: true, feedback: 'Essa é A pergunta. Quem conhece a régua escreve para a régua.' },
      { label: 'Qual fonte usar no PDF?', feedback: 'Estética ajuda, mas não pontua. Mire nos critérios.' },
      { label: 'Quem são os meus concorrentes?', feedback: 'Fora do seu controle. Energia nos critérios — que são públicos.' },
    ],
    mentorAnswer:
      'Todo edital publica a régua: critérios (inovação, viabilidade, equipe, impacto…) e seus PESOS. Sua proposta deve responder critério por critério — argumento sem critério é só opinião.',
  },
  {
    kind: 'quiz',
    stage: 1,
    question: 'Qual argumento DEFENDE melhor a necessidade do recurso?',
    options: [
      { label: '"Sem esse recurso, a etapa X não acontece — e ela entrega o resultado Y previsto na temática do edital"', correct: true },
      { label: '"Somos apaixonados pelo que fazemos"' },
      { label: '"Todo mundo está pedindo, então pedimos também"' },
    ],
    explain: 'Necessidade concreta + consequência + amarração com a temática. Isso é argumentar DENTRO do edital.',
  },
  {
    kind: 'quiz',
    stage: 1,
    question: 'Sua proposta está "validada" quando…',
    hint: 'Quem valida não é você — é o checklist do edital.',
    options: [
      { label: 'Cada exigência do edital tem uma evidência correspondente no texto', correct: true },
      { label: 'Você sente que ficou boa' },
      { label: 'Ficou com mais páginas que o limite' },
    ],
    explain: 'Validação é conformidade + evidência. O edital é o checklist — e a IA pode conferir isso com você, item a item.',
  },
  {
    kind: 'build',
    stage: 1,
    prompt: 'Então transforme isso em prática: monte o prompt que você mandaria pra IA antes de submeter a proposta.',
    correct: ['Confere comigo,', 'item a item,', 'se cada exigência do edital', 'tem evidência na proposta?'],
    extras: [
      { label: 'se o texto ficou bonito?', feedback: 'Estética não pontua — quem pontua é o checklist do edital.' },
      { label: 'se eu vou ganhar?', feedback: 'Ninguém garante resultado. Garanta o que está no seu controle: conformidade + evidência.' },
    ],
    mentorAnswer:
      'Esse é um prompt de validação de verdade: pede checagem item a item, contra o checklist público do edital. Formulado assim, ele transforma a IA na sua revisora de conformidade — em qualquer edital.',
  },
  {
    kind: 'mentor',
    stage: 1,
    text: 'Recap do núcleo, pra levar no bolso:',
    bullets: [
      'Conheça a régua (critérios e pesos) → escreva para a régua.',
      'Prove cada afirmação com evidência.',
      'Documentação impecável te mantém no jogo; argumentação aderente te faz vencer.',
    ],
  },

  // ═══ Etapa 3 — The Intersections ═══
  {
    kind: 'mentor',
    stage: 2,
    text: 'Última etapa: interseções. Nenhum conhecimento vive isolado — vamos conectar editais a um vizinho que você talvez já conheça: o pedido de financiamento em banco.',
  },
  {
    kind: 'compare',
    stage: 2,
    title: 'Edital de fomento × Financiamento bancário',
    intro: 'Revele cada interseção e repare no padrão: o que se transfere e o que muda.',
    rows: [
      { aspect: 'Documentos de base', edital: 'Certidões, docs societários, proposta', banco: 'Certidões, docs societários, plano de negócio', similar: true },
      { aspect: 'Quem avalia', edital: 'Comitê técnico (mérito)', banco: 'Análise de crédito (risco)', similar: false },
      { aspect: 'O que você defende', edital: 'Objetivo alinhado à temática', banco: 'Capacidade de pagamento', similar: false },
      { aspect: 'Preparo que se reaproveita', edital: 'Kit documental + argumento estruturado', banco: 'O MESMO kit + o mesmo argumento', similar: true },
    ],
  },
  {
    kind: 'quiz',
    stage: 2,
    question: 'O que muda MAIS de um contexto para o outro?',
    options: [
      { label: 'A lógica de decisão: mérito público × risco de crédito', correct: true },
      { label: 'Os documentos de base' },
      { label: 'A necessidade de argumentar bem' },
    ],
    explain: 'Documentos e argumentação se transferem quase inteiros; o que muda é a RÉGUA de quem decide.',
  },
  {
    kind: 'build',
    stage: 2,
    prompt: 'Você fecha a jornada FORMULANDO a pergunta que te leva daqui. Monte-a:',
    correct: ['Que outras réguas de decisão', 'existem pra captar recurso', '— e como cada uma', 'avalia?'],
    extras: [
      { label: 'Qual é a resposta certa?', feedback: 'Nesta jornada, a resposta certa é a próxima boa pergunta.' },
      { label: 'Posso parar de estudar?', feedback: 'A jornada inquisitiva nunca acaba 😄 Monte uma pergunta que abra portas.' },
    ],
    mentorAnswer:
      'Pergunta expansiva e transferível — é assim que conhecimento composto nasce. Investidores avaliam tese e tração; bancos, risco; editais, mérito e aderência. Documentar bem + argumentar dentro da régua é habilidade universal de captação. Jornada concluída!',
  },
];

/** Sequential "Pergunta N de M" numbering per stage (mentor/compare don't count). */
const isQuestionStep = (st: Step) => st.kind === 'ask' || st.kind === 'quiz' || st.kind === 'build';
const QUESTION_NUMBERS: (null | { n: number; of: number })[] = (() => {
  const perStage = [0, 1, 2].map((s) => STEPS.filter((st) => st.stage === s && isQuestionStep(st)).length);
  const counters = [0, 0, 0];
  return STEPS.map((st) => {
    if (!isQuestionStep(st)) return null;
    counters[st.stage] += 1;
    return { n: counters[st.stage], of: perStage[st.stage] };
  });
})();

/* ─────────────────────────── Answer / XP model ──────────────────────────── */

interface AnswerRecord {
  chosenLabel?: string;
  firstTry: boolean;
}

function xpFor(step: Step, rec: AnswerRecord): number {
  // Perguntar vale mais que responder: 'build' (formular) > 'ask' (escolher) > 'quiz'.
  if (step.kind === 'build') return rec.firstTry ? 20 : 8;
  if (step.kind === 'ask') return rec.firstTry ? 15 : 5;
  if (step.kind === 'quiz') return rec.firstTry ? 10 : 5;
  if (step.kind === 'compare') return 10;
  return 0;
}

/* ─────────────────────────── Chat presentation ──────────────────────────── */

function MentorBubble({ text, bullets, tone = 'default' }: { text: string; bullets?: string[]; tone?: 'default' | 'praise' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 max-w-[85%]">
      <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full bg-evergreen-soft border border-evergreen/30 mt-0.5">
        <Sparkles className="w-4 h-4 text-evergreen-hi" />
      </span>
      <div
        className={`rounded-2xl rounded-tl-md border px-5 py-3.5 text-[15px] leading-relaxed ${
          tone === 'praise'
            ? 'border-evergreen/40 bg-evergreen-soft/70 text-foreground'
            : 'border-border bg-card text-foreground/90'
        }`}
      >
        <p>{text}</p>
        {bullets && (
          <ul className="mt-2 space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-evergreen-hi mt-px">→</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-evergreen text-obsidiana px-5 py-3.5 text-[15px] font-medium leading-relaxed">
        {text}
      </div>
    </motion.div>
  );
}

function StageDivider({ stage }: { stage: number }) {
  const meta = STAGES[stage];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 py-2" data-testid={`stage-divider-${stage}`}>
      <span className="h-px flex-1 bg-border" />
      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${meta.colors.border} ${meta.colors.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${meta.colors.text}`} />
        <span className={`font-mono text-xs uppercase tracking-wider ${meta.colors.text}`}>
          Etapa {stage + 1} · {meta.longName}
        </span>
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Static rendering of a completed compare step inside the transcript. */
function CompareTable({ rows }: { rows: { aspect: string; edital: string; banco: string; similar: boolean }[] }) {
  return (
    <div className="rounded-2xl border border-border overflow-hidden text-[15px]">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] bg-background px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>Aspecto</span>
        <span>Edital</span>
        <span>Banco</span>
        <span className="w-16 text-center">Padrão</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] px-4 py-3 border-t border-border/60 items-center gap-2 leading-snug">
          <span className="text-foreground font-medium">{r.aspect}</span>
          <span className="text-muted-foreground">{r.edital}</span>
          <span className="text-muted-foreground">{r.banco}</span>
          <span
            className={`w-16 text-center font-mono text-[11px] uppercase tracking-wider ${
              r.similar ? 'text-evergreen-hi' : 'text-clay'
            }`}
          >
            {r.similar ? '≈ igual' : '≠ muda'}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── Active (interactive) cards ─────────────────────── */

function ContinueButton({ onClick, label = 'Continuar' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      data-testid="mentor-continue"
      className="mt-4 w-full inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-evergreen text-obsidiana text-[15px] font-medium hover:bg-evergreen-hi transition-colors"
    >
      {label} <ChevronRight className="w-4 h-4" />
    </button>
  );
}

/** Eyebrow row for the active card: stage-colored kind badge + counter. */
function ActiveEyebrow({
  icon: Icon,
  label,
  counter,
  colors,
}: {
  icon: LucideIcon;
  label: string;
  counter?: { n: number; of: number } | null;
  colors: StageColors;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-xs uppercase tracking-wider border ${colors.border} ${colors.bg} ${colors.text}`}
      >
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      {counter && (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {counter.n}/{counter.of}
        </span>
      )}
    </div>
  );
}

/** 'ask' — o coração inquisitivo: escolher a pergunta certa. */
function AskCard({
  step,
  counter,
  onDone,
}: {
  step: Extract<Step, { kind: 'ask' }>;
  counter: { n: number; of: number } | null;
  onDone: (rec: AnswerRecord) => void;
}) {
  const colors = STAGES[step.stage].colors;
  const [tried, setTried] = useState<Set<number>>(new Set());
  const [pickedGood, setPickedGood] = useState<number | null>(null);
  const answered = pickedGood !== null;

  function pick(i: number) {
    if (answered) return;
    if (step.options[i].good) setPickedGood(i);
    else setTried((prev) => new Set(prev).add(i));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border ${colors.border} bg-card p-5 md:p-6`}
      data-testid="active-ask"
    >
      <ActiveEyebrow icon={MessageCircleQuestion} label="Escolha a pergunta certa" counter={counter} colors={colors} />
      <h2 className="font-display font-bold text-xl text-foreground mt-4 leading-snug">{step.prompt}</h2>
      <div className="mt-4 space-y-2.5">
        {step.options.map((o, i) => {
          const wasTried = tried.has(i);
          const isGoodPick = pickedGood === i;
          return (
            <div key={i}>
              <button
                onClick={() => pick(i)}
                disabled={answered || wasTried}
                data-testid="ask-option"
                className={`w-full text-left rounded-2xl border px-4 py-3.5 text-[15px] leading-snug transition-colors ${
                  isGoodPick
                    ? 'border-evergreen bg-evergreen-soft text-foreground'
                    : wasTried
                      ? 'border-border/60 bg-background text-muted-foreground/60'
                      : 'border-border bg-background text-foreground hover:border-evergreen/50'
                }`}
              >
                <span className="flex items-start gap-2.5">
                  <MessageCircleQuestion
                    className={`w-4 h-4 mt-0.5 shrink-0 ${isGoodPick ? 'text-evergreen-hi' : wasTried ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}
                  />
                  {o.label}
                </span>
              </button>
              {wasTried && (
                <p className="mt-1.5 ml-4 flex items-start gap-1.5 text-sm text-muted-foreground leading-snug">
                  <Lightbulb className="w-4 h-4 text-clay shrink-0 mt-0.5" /> {o.feedback}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {answered && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
          <p className="flex items-start gap-2 text-[15px] text-evergreen-hi leading-snug">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {step.options[pickedGood].feedback}
          </p>
          <div className="rounded-2xl border border-border bg-background px-5 py-3.5 text-[15px] text-foreground/90 leading-relaxed">
            {step.mentorAnswer}
          </div>
          <ContinueButton onClick={() => onDone({ chosenLabel: step.options[pickedGood].label, firstTry: tried.size === 0 })} />
        </motion.div>
      )}
    </motion.div>
  );
}

/** 'build' — o aluno MONTA a pergunta peça por peça (word-bank estilo Duolingo).
 *  Aqui o gesto central não é responder: é FORMULAR. Distratores têm microcopy
 *  que ensina POR QUE certa peça enfraquece a pergunta. */
function BuildCard({
  step,
  counter,
  onDone,
}: {
  step: Extract<Step, { kind: 'build' }>;
  counter: { n: number; of: number } | null;
  onDone: (rec: AnswerRecord) => void;
}) {
  const colors = STAGES[step.stage].colors;

  // Word-bank: peças corretas + distratores, embaralhadas de forma determinística
  // (ordem alfabética ≠ ordem da resposta), pra replay estável no protótipo.
  const bank = useMemo(() => {
    const pieces = [
      ...step.correct.map((label) => ({ label, extra: undefined as string | undefined })),
      ...step.extras.map((e) => ({ label: e.label, extra: e.feedback })),
    ];
    return pieces.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [step]);

  const [picked, setPicked] = useState<number[]>([]);
  const [tries, setTries] = useState(0);
  const [miss, setMiss] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const composed = picked.map((i) => bank[i].label).join(' ');
  const target = step.correct.join(' ');

  function submit() {
    if (composed === target) {
      setMiss(null);
      setAnswered(true);
      return;
    }
    const usedExtra = picked.map((i) => bank[i]).find((p) => p.extra);
    setMiss(usedExtra?.extra ?? 'As peças certas estão aí — mas a ordem embaralha o foco. Reordene e tente de novo.');
    setTries((t) => t + 1);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border ${colors.border} bg-card p-5 md:p-6`}
      data-testid="active-build"
    >
      <ActiveEyebrow icon={Puzzle} label="Monte sua pergunta" counter={counter} colors={colors} />
      <h2 className="font-display font-bold text-xl text-foreground mt-4 leading-snug">{step.prompt}</h2>

      {/* Linha de resposta: as peças escolhidas, na ordem — clicar remove. */}
      <div
        className="mt-4 min-h-14 rounded-2xl border border-dashed border-border bg-background px-4 py-3 flex flex-wrap items-center gap-2"
        data-testid="build-answer-line"
      >
        {picked.length === 0 && (
          <span className="text-[15px] text-muted-foreground/70">Toque nas peças abaixo pra montar sua pergunta…</span>
        )}
        {picked.map((bankIndex, pos) => (
          <button
            key={`${bankIndex}-${pos}`}
            onClick={() => !answered && setPicked((prev) => prev.filter((_, p) => p !== pos))}
            disabled={answered}
            data-testid="build-picked-piece"
            className={`rounded-full border px-3.5 py-2 text-[15px] leading-none transition-colors ${
              answered
                ? 'border-evergreen bg-evergreen-soft text-foreground'
                : 'border-evergreen/50 bg-evergreen-soft/60 text-foreground hover:border-destructive/60 hover:bg-destructive/10'
            }`}
          >
            {bank[bankIndex].label}
          </button>
        ))}
      </div>

      {/* Banco de peças — clicar adiciona. */}
      {!answered && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="build-bank">
          {bank.map((piece, i) => {
            const used = picked.includes(i);
            return (
              <button
                key={i}
                onClick={() => {
                  setMiss(null);
                  setPicked((prev) => [...prev, i]);
                }}
                disabled={used}
                data-testid="build-bank-piece"
                className={`rounded-full border px-3.5 py-2 text-[15px] leading-none transition-colors ${
                  used
                    ? 'border-border/50 bg-muted text-muted-foreground/40'
                    : 'border-border bg-background text-foreground hover:border-evergreen/50'
                }`}
              >
                {piece.label}
              </button>
            );
          })}
        </div>
      )}

      {miss && !answered && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground leading-snug" data-testid="build-miss">
          <Lightbulb className="w-4 h-4 text-clay shrink-0 mt-0.5" /> {miss}
        </p>
      )}

      {!answered ? (
        <button
          onClick={submit}
          disabled={picked.length === 0}
          data-testid="build-submit"
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 h-12 rounded-full bg-evergreen text-obsidiana text-[15px] font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-40"
        >
          Perguntar ao mentor <ChevronRight className="w-4 h-4" />
        </button>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
          <p className="flex items-start gap-2 text-[15px] text-evergreen-hi leading-snug">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Pergunta bem formulada — essa abre resposta boa em qualquer IA.
          </p>
          <div className="rounded-2xl border border-border bg-background px-5 py-3.5 text-[15px] text-foreground/90 leading-relaxed">
            {step.mentorAnswer}
          </div>
          <ContinueButton onClick={() => onDone({ chosenLabel: target, firstTry: tries === 0 })} />
        </motion.div>
      )}
    </motion.div>
  );
}

/** 'quiz' — pergunta objetiva com dica e validação da IA. */
function QuizCard({
  step,
  counter,
  onDone,
}: {
  step: Extract<Step, { kind: 'quiz' }>;
  counter: { n: number; of: number } | null;
  onDone: (rec: AnswerRecord) => void;
}) {
  const colors = STAGES[step.stage].colors;
  const [tried, setTried] = useState<Set<number>>(new Set());
  const [correctPick, setCorrectPick] = useState<number | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const answered = correctPick !== null;

  function pick(i: number) {
    if (answered) return;
    if (step.options[i].correct) setCorrectPick(i);
    else setTried((prev) => new Set(prev).add(i));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-5 md:p-6"
      data-testid="active-quiz"
    >
      <ActiveEyebrow icon={Target} label="Valide seu conhecimento" counter={counter} colors={colors} />
      <h2 className="font-display font-bold text-xl text-foreground mt-4 leading-snug">{step.question}</h2>

      {step.hint && !answered && (
        <div className="mt-2.5">
          {hintOpen ? (
            <p className="flex items-start gap-1.5 text-sm text-clay leading-snug">
              <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" /> {step.hint}
            </p>
          ) : (
            <button
              onClick={() => setHintOpen(true)}
              data-testid="quiz-hint"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-clay transition-colors"
            >
              <Lightbulb className="w-4 h-4" /> Pedir dica
            </button>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {step.options.map((o, i) => {
          const wasTried = tried.has(i);
          const isCorrectPick = correctPick === i;
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={answered || wasTried}
              data-testid="quiz-card-option"
              className={`w-full text-left rounded-2xl border px-4 py-3.5 text-[15px] leading-snug transition-colors flex items-start gap-2.5 ${
                isCorrectPick
                  ? 'border-evergreen bg-evergreen-soft text-foreground'
                  : wasTried
                    ? 'border-destructive/50 bg-destructive/10 text-muted-foreground'
                    : 'border-border bg-background text-foreground hover:border-evergreen/50'
              }`}
            >
              {isCorrectPick ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-evergreen-hi" />
              ) : wasTried ? (
                <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive/80" />
              ) : (
                <span className="w-4 h-4 mt-0.5 shrink-0 rounded-full border border-muted-foreground/40" />
              )}
              {o.label}
            </button>
          );
        })}
      </div>

      {tried.size > 0 && !answered && (
        <p className="mt-3 text-sm text-muted-foreground">Errar também nivela — tente de novo.</p>
      )}

      {answered && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
          <div className="rounded-2xl border border-evergreen/30 bg-evergreen-soft/60 px-5 py-3.5 text-[15px] text-foreground/90 leading-relaxed">
            {step.explain}
          </div>
          <ContinueButton onClick={() => onDone({ chosenLabel: step.options[correctPick].label, firstTry: tried.size === 0 })} />
        </motion.div>
      )}
    </motion.div>
  );
}

/** 'compare' — interseções reveladas uma a uma. */
function CompareCard({
  step,
  onDone,
}: {
  step: Extract<Step, { kind: 'compare' }>;
  onDone: (rec: AnswerRecord) => void;
}) {
  const colors = STAGES[step.stage].colors;
  const [revealed, setRevealed] = useState(0);
  const allRevealed = revealed >= step.rows.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-card p-5 md:p-6"
      data-testid="active-compare"
    >
      <ActiveEyebrow icon={ArrowLeftRight} label="Interseções" colors={colors} />
      <h2 className="font-display font-bold text-xl text-foreground mt-4 leading-snug">{step.title}</h2>
      <p className="text-[15px] text-muted-foreground mt-1.5">{step.intro}</p>

      <div className="mt-4">
        <CompareTable rows={step.rows.slice(0, revealed)} />
      </div>

      {!allRevealed ? (
        <button
          onClick={() => setRevealed((r) => r + 1)}
          data-testid="compare-reveal"
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 h-12 rounded-full border border-evergreen/40 bg-evergreen-soft text-evergreen-hi text-[15px] font-medium hover:border-evergreen transition-colors"
        >
          Revelar interseção {revealed + 1} de {step.rows.length}
        </button>
      ) : (
        <ContinueButton onClick={() => onDone({ firstTry: true })} />
      )}
    </motion.div>
  );
}

function MentorCard({
  step,
  onDone,
}: {
  step: Extract<Step, { kind: 'mentor' }>;
  onDone: (rec: AnswerRecord) => void;
}) {
  return (
    <div data-testid="active-mentor">
      <MentorBubble text={step.text} bullets={step.bullets} />
      <div className="max-w-[85%] pl-11">
        <ContinueButton onClick={() => onDone({ firstTry: true })} />
      </div>
    </div>
  );
}

/* ────────────────────────── Progress header ─────────────────────────────── */

function StageProgress({ index }: { index: number }) {
  const perStage = [0, 1, 2].map((s) => STEPS.filter((st) => st.stage === s).length);
  const doneBefore = [0, 1, 2].map((s) => STEPS.slice(0, index).filter((st) => st.stage === s).length);
  const currentStage = index < STEPS.length ? STEPS[index].stage : 2;

  return (
    <div className="flex items-stretch gap-2" data-testid="stage-progress" aria-label="Progresso da jornada">
      {STAGES.map((meta, s) => {
        const Icon = meta.icon;
        const pct = perStage[s] > 0 ? Math.round((doneBefore[s] / perStage[s]) * 100) : 0;
        const active = s === currentStage && index < STEPS.length;
        const complete = doneBefore[s] >= perStage[s];
        return (
          <div key={s} className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon className={`w-3.5 h-3.5 shrink-0 ${active || complete ? meta.colors.text : 'text-muted-foreground/60'}`} />
              <span
                className={`font-mono text-[11px] uppercase tracking-wider truncate ${
                  active ? meta.colors.text : complete ? 'text-foreground/70' : 'text-muted-foreground/60'
                }`}
              >
                {s + 1}. {meta.name}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              {/* CSS transition (not framer-motion): width animations must survive
                  rapid successive re-renders without an animation loop. */}
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${meta.colors.bar} ${complete ? 'opacity-70' : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Intro screen ─────────────────────────────── */

/**
 * A abertura é um CONSTRUTOR DE PROMPT guiado: três perguntas norteadoras
 * respondem "DO QUE fazer o prompt" (uma situação real) e "COMO fazer o
 * prompt" (ponto de partida + objetivo de uso). O prompt é montado ao vivo,
 * com checklist de anatomia — o aprendizado de prompting começa ANTES da
 * jornada. Pré-preenchido com o exemplo real de um colega (editais).
 */
function IntroScreen({
  tema,
  partida,
  objetivo,
  onTema,
  onPartida,
  onObjetivo,
  onStart,
}: {
  tema: string;
  partida: number | null;
  objetivo: string;
  onTema: (v: string) => void;
  onPartida: (v: number) => void;
  onObjetivo: (v: string) => void;
  onStart: () => void;
}) {
  const prompt = assemblePrompt(tema, partida, objetivo);
  const checks = [
    {
      ok: tema.trim().length > 0,
      label: 'Do quê: um tema concreto',
      why: 'Situação real rende mais que palavra solta — "editais de fomento" > "editais".',
    },
    {
      ok: partida !== null,
      label: 'Como: seu ponto de partida',
      why: 'Dizer de onde você parte calibra o nível das perguntas do mentor.',
    },
    {
      ok: objetivo.trim().length > 0,
      label: 'Como: um objetivo de uso',
      why: 'Prompt com "pra quê" recebe resposta com direção.',
    },
  ];
  const canStart = tema.trim().length > 0 && partida !== null;

  return (
    <div className="min-h-screen bg-background" data-testid="journey-intro">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-evergreen-hi">
            Experiência conversacional guiada por IA
          </p>
          <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mt-2">
            Vamos montar seu prompt juntos?
          </h1>
          <p className="text-base text-muted-foreground mt-3 max-w-xl mx-auto">
            Três perguntas norteadoras viram um prompt forte — e o prompt forte vira uma jornada guiada.
          </p>
        </div>

        {/* ── Construtor de prompt: 3 perguntas norteadoras ── */}
        <div className="rounded-3xl border border-border bg-card p-5 md:p-6 space-y-6">
          {/* 1 · DO QUE fazer o prompt */}
          <label className="block">
            <span className={`font-mono text-xs uppercase tracking-wider ${STAGES[0].colors.text}`}>
              1 · Do que fazer o prompt?
            </span>
            <p className="font-display font-semibold text-lg text-foreground mt-1">
              Que situação real você quer destravar?
            </p>
            <textarea
              value={tema}
              onChange={(e) => onTema(e.target.value)}
              rows={2}
              placeholder="Uma decisão na sua frente, um processo que você precisa dominar…"
              data-testid="intro-tema"
              className="mt-2 w-full rounded-2xl border border-border bg-background p-4 text-[15px] leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-evergreen/40"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Precisa de ideia?</span>
              {TEMA_IDEAS.map((idea) => (
                <button
                  key={idea}
                  onClick={() => onTema(idea)}
                  data-testid="intro-tema-idea"
                  className={`rounded-full border px-3 py-1.5 text-sm leading-none transition-colors ${
                    tema === idea
                      ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
                      : 'border-border bg-background text-muted-foreground hover:border-evergreen/50 hover:text-foreground'
                  }`}
                >
                  {idea}
                </button>
              ))}
            </div>
          </label>

          {/* 2 · COMO fazer — ponto de partida */}
          <div>
            <span className={`font-mono text-xs uppercase tracking-wider ${STAGES[1].colors.text}`}>
              2 · Como fazer o prompt — de onde você parte?
            </span>
            <p className="font-display font-semibold text-lg text-foreground mt-1">
              Qual é a sua relação com esse tema hoje?
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2" data-testid="intro-partida">
              {PARTIDAS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => onPartida(i)}
                  data-testid="intro-partida-option"
                  className={`rounded-full border px-4 py-2.5 text-[15px] leading-none transition-colors ${
                    partida === i
                      ? 'border-clay bg-clay/10 text-clay font-medium'
                      : 'border-border bg-background text-foreground hover:border-clay/50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3 · COMO fazer — objetivo de uso */}
          <label className="block">
            <span className={`font-mono text-xs uppercase tracking-wider ${STAGES[2].colors.text}`}>
              3 · Como fazer o prompt — pra quê?
            </span>
            <p className="font-display font-semibold text-lg text-foreground mt-1">
              Saber disso te permite fazer o quê?
            </p>
            <textarea
              value={objetivo}
              onChange={(e) => onObjetivo(e.target.value)}
              rows={2}
              placeholder="Ex.: submeter meu primeiro projeto, cobrar o preço certo…"
              data-testid="intro-objetivo"
              className="mt-2 w-full rounded-2xl border border-border bg-background p-4 text-[15px] leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-evergreen/40"
            />
          </label>

          {/* ── Prompt montado ao vivo + anatomia ── */}
          <div className="border-t border-border/60 pt-5">
            <span className="font-mono text-xs uppercase tracking-wider text-evergreen-hi">
              Seu prompt, montado ao vivo
            </span>
            <div className="mt-2.5 flex justify-end" data-testid="intro-prompt-preview">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-evergreen text-obsidiana px-5 py-3.5 text-[15px] font-medium leading-relaxed">
                {prompt}
              </div>
            </div>
            <ul className="mt-4 space-y-2" data-testid="intro-checklist">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm leading-snug">
                  {c.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-evergreen-hi" />
                  ) : (
                    <span className="w-4 h-4 shrink-0 mt-0.5 rounded-full border border-muted-foreground/40" />
                  )}
                  <span>
                    <span className={c.ok ? 'text-foreground font-medium' : 'text-muted-foreground'}>{c.label}</span>
                    <span className="text-muted-foreground"> — {c.why}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-1.5 text-sm text-muted-foreground leading-snug">
              <Sparkles className="w-4 h-4 text-evergreen-hi shrink-0 mt-0.5" />
              Protótipo: exemplo real do time pré-preenchido. A experiência serve a qualquer tema.
            </p>
          </div>
        </div>

        {/* ── As 3 etapas, cada uma com sua cor ── */}
        <div>
          <h2 className="font-display font-bold text-xl text-foreground text-center">
            Sua jornada terá 3 etapas
          </h2>
          <p className="text-base text-muted-foreground text-center mt-1.5">
            O mentor pergunta, valida e direciona — você constrói o entendimento.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3" data-testid="intro-stages">
            {STAGES.map((meta, i) => {
              const Icon = meta.icon;
              return (
                <div key={i} className={`rounded-3xl border ${meta.colors.border} ${meta.colors.bg} p-5`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-xs uppercase tracking-wider ${meta.colors.text}`}>
                      Etapa {i + 1}
                    </span>
                    <Icon className={`w-4 h-4 ${meta.colors.text}`} />
                  </div>
                  <h3 className={`font-display font-bold text-lg mt-2 ${meta.colors.text}`}>{meta.longName}</h3>
                  <p className="text-[15px] text-foreground/85 mt-2 leading-relaxed">{meta.desc}</p>
                  <p className="text-sm text-muted-foreground mt-3 flex items-start gap-1.5 leading-snug">
                    <Lightbulb className={`w-4 h-4 shrink-0 mt-0.5 ${meta.colors.text}`} />
                    {meta.why}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onStart}
            disabled={!canStart}
            data-testid="start-journey"
            className="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-evergreen text-obsidiana font-display font-semibold text-[15px] uppercase tracking-wide hover:bg-evergreen-hi transition-colors disabled:opacity-40"
          >
            Começar jornada <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── The journey ──────────────────────────────── */

function MentorFlowPrototype() {
  const [phase, setPhase] = useState<'intro' | 'journey'>('intro');
  const [tema, setTema] = useState(SAMPLE_TEMA);
  const [partida, setPartida] = useState<number | null>(SAMPLE_PARTIDA);
  const [objetivo, setObjetivo] = useState(SAMPLE_OBJETIVO);
  const prompt = assemblePrompt(tema, partida, objetivo);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [run, setRun] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const finished = index >= STEPS.length;
  const xp = useMemo(() => answers.reduce((acc, rec, i) => acc + xpFor(STEPS[i], rec), 0), [answers]);
  const goodQuestions = answers.filter((rec, i) => STEPS[i].kind === 'ask' && rec.firstTry).length;
  const askTotal = STEPS.filter((s) => s.kind === 'ask').length;
  const builtQuestions = answers.filter((rec, i) => STEPS[i].kind === 'build' && rec.firstTry).length;
  const buildTotal = STEPS.filter((s) => s.kind === 'build').length;
  const quizFirstTry = answers.filter((rec, i) => STEPS[i].kind === 'quiz' && rec.firstTry).length;
  const quizTotal = STEPS.filter((s) => s.kind === 'quiz').length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [index]);

  function complete(rec: AnswerRecord) {
    setAnswers((prev) => [...prev, rec]);
    setIndex((i) => i + 1);
  }

  function restart() {
    setIndex(0);
    setAnswers([]);
    setRun((r) => r + 1);
    setPhase('intro');
  }

  const current = finished ? null : STEPS[index];
  const counter = finished ? null : QUESTION_NUMBERS[index];

  if (phase === 'intro') {
    return (
      <IntroScreen
        tema={tema}
        partida={partida}
        objetivo={objetivo}
        onTema={setTema}
        onPartida={setPartida}
        onObjetivo={setObjetivo}
        onStart={() => setPhase('journey')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Chrome: X + 3-stage progress + XP ── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <button aria-label="Sair" className="p-2 -ml-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <StageProgress index={index} />
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-evergreen/30 bg-evergreen-soft font-mono text-sm tabular-nums text-evergreen-hi shrink-0"
            data-testid="xp-chip"
          >
            <Zap className="w-3.5 h-3.5" /> {xp} XP
          </span>
        </div>
      </header>

      {/* ── Chat feed ── */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-wider text-evergreen-hi">Jornada inquisitiva</p>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mt-1">
              Editais de fomento, de fora pra dentro
            </h1>
          </div>

          {/* Eco do prompt montado na intro — a jornada nasce dele. */}
          <div data-testid="prompt-echo">
            <UserBubble text={prompt} />
          </div>

          {/* Transcript of completed steps (derived, replay-safe). */}
          {STEPS.slice(0, index).map((step, i) => {
            const rec = answers[i];
            const firstOfStage = i === 0 || STEPS[i - 1].stage !== step.stage;
            return (
              <div key={`${run}-${i}`} className="space-y-4">
                {firstOfStage && <StageDivider stage={step.stage} />}
                {step.kind === 'mentor' && <MentorBubble text={step.text} bullets={step.bullets} />}
                {step.kind === 'ask' && rec && (
                  <>
                    <MentorBubble text={step.prompt} />
                    <UserBubble text={rec.chosenLabel ?? ''} />
                    <MentorBubble tone="praise" text={step.mentorAnswer} />
                  </>
                )}
                {step.kind === 'build' && rec && (
                  <>
                    <MentorBubble text={step.prompt} />
                    <UserBubble text={rec.chosenLabel ?? ''} />
                    <MentorBubble tone="praise" text={step.mentorAnswer} />
                  </>
                )}
                {step.kind === 'quiz' && rec && (
                  <>
                    <MentorBubble text={step.question} />
                    <UserBubble text={rec.chosenLabel ?? ''} />
                    <MentorBubble tone="praise" text={step.explain} />
                  </>
                )}
                {step.kind === 'compare' && (
                  <>
                    <MentorBubble text={step.intro} />
                    <CompareTable rows={step.rows} />
                  </>
                )}
              </div>
            );
          })}

          {/* Active step. */}
          {current && (
            <div key={`${run}-active-${index}`} className="space-y-4">
              {(index === 0 || STEPS[index - 1].stage !== current.stage) && <StageDivider stage={current.stage} />}
              {current.kind === 'mentor' && <MentorCard step={current} onDone={complete} />}
              {current.kind === 'ask' && <AskCard step={current} counter={counter} onDone={complete} />}
              {current.kind === 'build' && <BuildCard step={current} counter={counter} onDone={complete} />}
              {current.kind === 'quiz' && <QuizCard step={current} counter={counter} onDone={complete} />}
              {current.kind === 'compare' && <CompareCard step={current} onDone={complete} />}
            </div>
          )}

          {/* Completion. */}
          {finished && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-evergreen/30 bg-card p-8 text-center"
              data-testid="journey-complete"
            >
              <Trophy className="w-12 h-12 text-evergreen-hi mx-auto" />
              <h2 className="font-display font-bold text-2xl md:text-3xl text-foreground mt-4">Jornada concluída!</h2>
              <p className="text-base text-muted-foreground mt-1.5">
                3 etapas vencidas escolhendo as perguntas certas.
              </p>
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-border bg-background py-4">
                  <p className="font-mono text-3xl tabular-nums text-evergreen-hi">{xp}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1.5">XP total</p>
                </div>
                <div className="rounded-2xl border border-border bg-background py-4">
                  <p className="font-mono text-3xl tabular-nums text-foreground">{builtQuestions}/{buildTotal}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1.5">Perguntas montadas de 1ª</p>
                </div>
                <div className="rounded-2xl border border-border bg-background py-4">
                  <p className="font-mono text-3xl tabular-nums text-foreground">{goodQuestions}/{askTotal}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1.5">Boas perguntas de 1ª</p>
                </div>
                <div className="rounded-2xl border border-border bg-background py-4">
                  <p className="font-mono text-3xl tabular-nums text-foreground">{quizFirstTry}/{quizTotal}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1.5">Acertos de 1ª</p>
                </div>
              </div>
              {/* ── Resumo do fluxo (1 síntese por etapa, na cor da etapa) ── */}
              <div className="mt-8 text-left" data-testid="journey-summary">
                <h3 className="font-display font-semibold text-base uppercase tracking-wide text-foreground text-center">
                  Resumo do fluxo
                </h3>
                <div className="mt-4 space-y-3">
                  {STAGE_SUMMARIES.map((text, i) => {
                    const meta = STAGES[i];
                    const Icon = meta.icon;
                    return (
                      <div key={i} className={`rounded-2xl border ${meta.colors.border} ${meta.colors.bg} p-4 flex gap-3`}>
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.colors.text}`} />
                        <div>
                          <p className={`font-mono text-xs uppercase tracking-wider ${meta.colors.text}`}>
                            Etapa {i + 1} · {meta.longName}
                          </p>
                          <p className="text-[15px] text-foreground/90 mt-1.5 leading-relaxed">{text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── As perguntas do aluno, devolvidas como prompts prontos ── */}
              <div className="mt-8 text-left" data-testid="journey-questions">
                <h3 className="font-display font-semibold text-base uppercase tracking-wide text-foreground text-center">
                  Suas perguntas — leve como prompts
                </h3>
                <p className="text-sm text-muted-foreground text-center mt-1.5">
                  Cada uma funciona como prompt pronto pra continuar aprendendo com qualquer IA.
                </p>
                <ul className="mt-4 space-y-2.5">
                  {STEPS.map((step, i) => {
                    const rec = answers[i];
                    if (!rec?.chosenLabel || (step.kind !== 'ask' && step.kind !== 'build')) return null;
                    return (
                      <li
                        key={i}
                        className="rounded-2xl border border-border bg-background px-4 py-3 flex items-start gap-2.5"
                      >
                        {step.kind === 'build' ? (
                          <Puzzle className="w-4 h-4 mt-0.5 shrink-0 text-clay" />
                        ) : (
                          <MessageCircleQuestion className="w-4 h-4 mt-0.5 shrink-0 text-evergreen-hi" />
                        )}
                        <span className="text-[15px] text-foreground/90 leading-snug">
                          {rec.chosenLabel}
                          <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                            {step.kind === 'build' ? 'você montou' : 'você escolheu'}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* ── Vocabulário essencial do tema ── */}
              <div className="mt-8 text-left" data-testid="journey-glossary">
                <h3 className="font-display font-semibold text-base uppercase tracking-wide text-foreground text-center">
                  Vocabulário essencial · Editais
                </h3>
                <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {GLOSSARY.map(({ term, def }) => (
                    <div key={term} className="rounded-xl border border-border bg-background px-4 py-3">
                      <dt className="text-[15px] font-medium text-evergreen-hi">{term}</dt>
                      <dd className="text-sm text-muted-foreground mt-1 leading-relaxed">{def}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <button
                onClick={restart}
                className="mt-8 inline-flex items-center gap-2 h-11 px-6 rounded-full border border-border text-foreground hover:bg-muted transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Refazer do início
              </button>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>
    </div>
  );
}

/* ────────────────────────────────── Meta ─────────────────────────────────── */

const meta: Meta = {
  title: 'Design Playground/Fluxo Mentor IA',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
};
export default meta;

export const Prototipo: StoryObj = {
  name: 'Protótipo — Editais de fomento',
  render: () => <MentorFlowPrototype />,
};
