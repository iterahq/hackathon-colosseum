/**
 * The activity-scoped translations, so a host that has no i18n system still
 * renders WORDS instead of keys.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A LIBRARY SHIPS A DICTIONARY AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 * The contract makes `i18n` the REQUIRED member of `<ActivityProvider>`, and
 * that stays true — the port is the seam, and a host with its own translations
 * overrides every key here. What the contract did not answer is what a
 * consumer sees BEFORE it has wired anything: with a port and no defaults, the
 * first render of a freshly installed package is a screen of
 * `activity.singleChoice` / `activity.submit`. That is not a working library,
 * it is a library plus homework, and the Fase D prototype would have paid it
 * first.
 *
 * So the package carries the 24 strings its own renderers ask for, in both
 * locales, and `<ActivityProvider>` falls back to them per key — key by key,
 * not all-or-nothing, so a host that translates half of them keeps its half.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS CANNOT DRIFT FROM THE PLAYER
 * ─────────────────────────────────────────────────────────────────────────────
 * These values are a VERBATIM copy of the same keys in the Itera Player's
 * `src/i18n/index.ts`. A copy that nobody checks is how two dictionaries end up
 * saying different things, so `src/test/activityDefaultI18n.test.ts` asserts —
 * mechanically, both locales, every key — that the two agree. Change a string
 * in the app without changing it here (or the reverse) and that test goes red.
 *
 * ⚠️ Do NOT add keys here that the package's own renderers do not use. This is
 * the package's vocabulary, not a mirror of the app's dictionary. "Its own
 * renderers" includes the ones behind the `/code` entrypoint: the per-key
 * fallback lives in `../context.tsx`, i.e. in the BASE, so splitting the
 * dictionary per entrypoint would mean every consumer of `/code` had to merge
 * two dictionaries by hand — precisely the homework this file exists to
 * remove. Fifteen extra strings in the base is the cheaper side of that trade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS A SECOND PREFIX (`terminal.`) SINCE FASE C STEP 4
 * ─────────────────────────────────────────────────────────────────────────────
 * Until the sandbox moved, every key here began with `activity.`, and
 * `src/test/activityDefaultI18n.test.tsx` asserted exactly that. The terminal
 * sandbox arrived with its own 15-key namespace, created by the very refinement
 * (`20260807-itera-terminal-sandbox-refinamentos` §3) that pulled its copy OUT
 * of inline `{ pt, en }` literals and into the dictionary — so renaming those
 * keys to `activity.terminal.*` on the way in would undo a rename someone made
 * on purpose two days ago, and desynchronise this file from the Player's,
 * which is the one thing this dictionary may not do.
 *
 * So the rule is now a short ALLOWLIST of prefixes rather than a single one,
 * and it is still a closed list: `activity.`, `terminal.` and — since Fase C
 * step 5 — `code.`. The `code.` namespace arrived for the same reason
 * `terminal.` did: the keys already exist under that name in the Player's
 * `src/i18n/index.ts`, and renaming them on the way in would desynchronise the
 * two dictionaries, which is the one thing this file may not do. A FOURTH
 * prefix is a decision, not an accident, which is exactly what the assertion
 * is for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOURTH PREFIX — `quiz.`, AND WHY IT IS EXACTLY ONE KEY (Fase D)
 * ─────────────────────────────────────────────────────────────────────────────
 * `quiz.trueOrFalse` is the eyebrow a two-option quiz shows above the question.
 * It arrived with `QuizActivity` and it is the ONLY key under this prefix — the
 * quiz's other five strings are all `activity.*` already.
 *
 * The decision the assertion asked for, made out loud: renaming it to
 * `activity.quiz.trueOrFalse` on the way in would be a nicer namespace and a
 * WORSE outcome, because the Player has shipped it as `quiz.trueOrFalse` since
 * before any of this was a package, and the two dictionaries agreeing verbatim
 * is the property that keeps an un-provided render faithful instead of merely
 * plausible. A tidy name is not worth a divergence. If the prefix is ever to be
 * folded into `activity.`, it is a rename in the PLAYER first, and this file
 * follows.
 */
import type { ActivityLocale } from '../ports.js';

/** The activity strings this package's renderers ask for, per locale. */
export const ACTIVITY_DICTIONARY: Record<ActivityLocale, Record<string, string>> = {
  pt: {
    'activity.concept': 'Conceito',
    'activity.codeInvalid': 'Esta atividade de código está com a configuração inválida.',
    'activity.codeSnackHint': 'Edite o código; o preview atualiza sozinho.',
    'activity.continue': 'Continuar',
    'code.checks.allPassed': 'Tudo certo! Você conseguiu.',
    'code.checks.continueAnyway': 'Seguir mesmo assim',
    'code.checks.editAgain': 'Editar de novo',
    'code.checks.frozen': 'O editor fica travado enquanto o resultado está na tela.',
    'code.checks.retry': 'Tentar de novo',
    'code.checks.running': 'Conferindo…',
    'code.checks.score': '{passed} de {total}',
    'code.checks.someFailed': 'Quase lá — falta pouco.',
    // Variantes GUIADAS: o código vem escrito e travado, e só as lacunas
    // autoradas aceitam interação. A instrução é por variante porque colocar
    // uma palavra, escolher numa lista e digitar de cabeça não são a mesma tarefa.
    'code.guided.blankLabel': 'lacuna do código',
    'code.guided.bankLabel': 'palavras disponíveis',
    'code.guided.hint.options': 'O código já está escrito. Toque numa palavra e ela entra na lacuna.',
    'code.guided.hint.dropdown': 'O código já está escrito. Escolha a opção certa em cada lacuna.',
    'code.guided.hint.text': 'O código já está escrito. Digite o que falta em cada lacuna.',
    'code.guided.hint.mixed': 'O código já está escrito. Complete cada lacuna do seu jeito.',
    'code.guided.previewWaiting': 'Complete as lacunas para ver o resultado rodando.',
    'code.guided.wrongBlank': 'Essa lacuna ainda não está certa.',
    // A posição é o que liga a linha do veredito à lacuna na tela: sem ela,
    // "essa lacuna" com três erros na lista não diz qual.
    'code.guided.blankPosition': 'Lacuna {position}',
    'code.reset.action': 'Recomeçar do código inicial',
    'code.reset.cancel': 'Continuar editando',
    'code.reset.confirm': 'Sim, recomeçar',
    'code.reset.confirmPrompt': 'Isso apaga o que você escreveu e traz o código inicial de volta. Quer recomeçar?',
    'activity.conceptReveal': 'Pense antes',
    'activity.diagram': 'Diagrama',
    'activity.document': 'Documento',
    'activity.artifactVisibilityNotice':
      'O que você escrever aqui fica salvo na sua conta e pode ser lido pelo administrador da sua organização.',
    'activity.minWords': 'mínimo',
    'activity.quizPrompt': 'Selecione a resposta correta',
    'activity.reflectionPlaceholder': 'Escreva aqui o que você aprendeu…',
    'activity.words': 'palavras',
    'quiz.trueOrFalse': 'Verdadeiro ou falso?',
    'activity.done': 'Concluída',
    'activity.explanationTitle': 'Entenda o porquê',
    'activity.instructionZoomClose': 'Fechar',
    'activity.instructionZoomOpen': 'Ampliar a imagem',
    'activity.markDone': 'Marcar como concluída',
    'activity.match': 'Associação',
    'activity.matchHint': 'Toque num card e depois no seu par',
    'activity.moveDown': 'Mover para baixo',
    'activity.moveUp': 'Mover para cima',
    'activity.multiChoice': 'Escolha múltipla',
    'activity.noItems': 'Nenhum item configurado',
    'activity.noOptions': 'Nenhuma opção configurada',
    'activity.order': 'Ordenação',
    'activity.orderHint': 'Arraste ou use as setas para ordenar',
    'activity.reveal.hide': 'Esconder resposta',
    'activity.reveal.show': 'Ver resposta',
    'activity.sandboxScenario': 'Sandbox',
    'activity.selectAll': 'Selecione todas as corretas',
    'activity.sent': 'Enviado',
    'activity.singleChoice': 'Escolha única',
    'activity.step': 'Passo',
    'activity.stepCleared': 'passo concluído',
    'activity.submit': 'Enviar',
    'activity.video': 'Vídeo',
    'activity.video.external': 'Este vídeo está hospedado fora da plataforma.',
    'activity.video.missing': 'Vídeo não configurado',
    'activity.video.open': 'Abrir vídeo',
    // Espelho read-only do chat no palco da aula ao vivo.
    'chat.mirror.completed': 'roteiro concluído',
    'chat.mirror.empty': 'O aluno ainda não enviou nenhuma mensagem.',
    'terminal.buildCommand': 'Monte o comando',
    'terminal.clear': 'Limpar',
    'terminal.empty.freeText': '# digite um comando e aperte Enter',
    'terminal.empty.options': '# monte um comando nas opções abaixo',
    'terminal.hint': 'ver dica',
    'terminal.mirror.completed': 'roteiro concluído',
    'terminal.mirror.empty': '# o aluno ainda não rodou nenhum comando',
    'terminal.paletteEmpty': 'todas as peças estão no comando acima',
    'terminal.pickCommand': 'Escolha o comando',
    'terminal.placeholder.assemble': 'monte o comando e aperte Rodar',
    'terminal.placeholder.freeText': 'digite um comando…',
    'terminal.placeholder.tap': 'toque numa opção abaixo — ela já roda',
    'terminal.ps1': 'aluno@itera:~$',
    'terminal.removeChip': 'toque para devolver à paleta',
    'terminal.restart': 'Recomeçar',
    'terminal.run': 'Rodar',
    'terminal.stepCompleted': 'passo concluído',
    'terminal.windowTitle': 'bash — sandbox',
  },
  en: {
    'activity.concept': 'Concept',
    'activity.codeInvalid': 'This code activity has an invalid configuration.',
    'activity.codeSnackHint': 'Edit the code; the preview updates live.',
    'activity.continue': 'Continue',
    'code.checks.allPassed': 'All good! You did it.',
    'code.checks.continueAnyway': 'Continue anyway',
    'code.checks.editAgain': 'Edit again',
    'code.checks.frozen': 'The editor stays locked while the result is on screen.',
    'code.checks.retry': 'Try again',
    'code.checks.running': 'Checking…',
    'code.checks.score': '{passed} of {total}',
    'code.checks.someFailed': 'Almost there — just a bit more.',
    'code.guided.blankLabel': 'code blank',
    'code.guided.bankLabel': 'available words',
    'code.guided.hint.options': 'The code is already written. Tap a word and it drops into the blank.',
    'code.guided.hint.dropdown': 'The code is already written. Pick the right option in each blank.',
    'code.guided.hint.text': 'The code is already written. Type what is missing in each blank.',
    'code.guided.hint.mixed': 'The code is already written. Fill in each blank your own way.',
    'code.guided.previewWaiting': 'Fill in the blanks to see it running.',
    'code.guided.wrongBlank': 'This blank is not right yet.',
    'code.guided.blankPosition': 'Blank {position}',
    'code.reset.action': 'Start over from the first code',
    'code.reset.cancel': 'Keep editing',
    'code.reset.confirm': 'Yes, start over',
    'code.reset.confirmPrompt': 'This erases what you wrote and brings the first code back. Start over?',
    'activity.conceptReveal': 'Think first',
    'activity.diagram': 'Diagram',
    'activity.document': 'Document',
    'activity.artifactVisibilityNotice':
      'What you write here is saved to your account and can be read by your organization\'s administrator.',
    'activity.minWords': 'minimum',
    'activity.quizPrompt': 'Select the correct answer',
    'activity.reflectionPlaceholder': 'Write what you learned here…',
    'activity.words': 'words',
    'quiz.trueOrFalse': 'True or false?',
    'activity.done': 'Done',
    'activity.explanationTitle': 'Here is why',
    'activity.instructionZoomClose': 'Close',
    'activity.instructionZoomOpen': 'Zoom in on the image',
    'activity.markDone': 'Mark as done',
    'activity.match': 'Match',
    'activity.matchHint': 'Tap a card, then its pair',
    'activity.moveDown': 'Move down',
    'activity.moveUp': 'Move up',
    'activity.multiChoice': 'Multiple choice',
    'activity.noItems': 'No items configured',
    'activity.noOptions': 'No options configured',
    'activity.order': 'Order',
    'activity.orderHint': 'Drag or use the arrows to reorder',
    'activity.reveal.hide': 'Hide answer',
    'activity.reveal.show': 'Show answer',
    'activity.sandboxScenario': 'Sandbox',
    'activity.selectAll': 'Select all that apply',
    'activity.sent': 'Sent',
    'activity.singleChoice': 'Single choice',
    'activity.step': 'Step',
    'activity.stepCleared': 'step cleared',
    'activity.submit': 'Submit',
    'activity.video': 'Video',
    'activity.video.external': 'This video is hosted outside the platform.',
    'activity.video.missing': 'No video configured',
    'activity.video.open': 'Open video',
    'chat.mirror.completed': 'scenario completed',
    'chat.mirror.empty': 'The learner has not sent a message yet.',
    'terminal.buildCommand': 'Build the command',
    'terminal.clear': 'Clear',
    'terminal.empty.freeText': '# type a command and press Enter',
    'terminal.empty.options': '# build a command from the options below',
    'terminal.hint': 'see hint',
    'terminal.mirror.completed': 'scenario completed',
    'terminal.mirror.empty': '# the learner has not run a command yet',
    'terminal.paletteEmpty': 'every piece is up in the command',
    'terminal.pickCommand': 'Pick the command',
    'terminal.placeholder.assemble': 'build the command, then press Run',
    'terminal.placeholder.freeText': 'type a command…',
    'terminal.placeholder.tap': 'tap an option below — it runs right away',
    'terminal.ps1': 'student@itera:~$',
    'terminal.removeChip': 'tap to send it back to the tray',
    'terminal.restart': 'Restart',
    'terminal.run': 'Run',
    'terminal.stepCompleted': 'step completed',
    'terminal.windowTitle': 'bash — sandbox',
  },
};

/** Every key the package's own renderers translate. */
export const ACTIVITY_I18N_KEYS: readonly string[] = Object.keys(ACTIVITY_DICTIONARY.en);

/**
 * A ready-made `ActivityI18n` over the built-in dictionary.
 *
 * The shortest possible host adapter: `<ActivityProvider i18n={createActivityI18n('pt')}>`.
 * `{name}`-style interpolation is supported so the port behaves the same way
 * the Player's `t` does — and since step 5 it is load-bearing rather than
 * defensive: `code.checks.score` is `'{passed} de {total}'`.
 */
export function createActivityI18n(locale: ActivityLocale = 'pt') {
  return {
    locale,
    t: (key: string, vars?: Record<string, string | number>) => {
      let str = ACTIVITY_DICTIONARY[locale]?.[key] ?? ACTIVITY_DICTIONARY.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
      return str;
    },
    tText: (bag: Record<string, string | undefined> | null | undefined) => {
      if (!bag) return '';
      return bag[locale] ?? bag.en ?? bag.pt ?? Object.values(bag).find(Boolean) ?? '';
    },
  };
}
