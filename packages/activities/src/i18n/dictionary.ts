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
    'activity.codeSnackHint': 'Edite o código; a telinha de resultado atualiza sozinha.',
    'activity.continue': 'Continuar',
    'code.checks.allPassed': 'Tudo certo! Você conseguiu.',
    'code.checks.continueAnyway': 'Seguir mesmo assim',
    'code.checks.editAgain': 'Editar de novo',
    'code.checks.frozen': 'O editor fica travado enquanto o resultado está na tela.',
    'code.checks.retry': 'Tentar de novo',
    'code.checks.running': 'Conferindo…',
    'code.checks.score': '{passed} de {total}',
    'code.checks.someFailed': 'Quase lá — falta pouco.',
    // VIDAS: o teto de envios errados por exercício (`code/attemptBudget.ts`).
    // Duas chaves para o plural porque em português ele não é um "s" no fim de
    // uma string interpolada — "1 tentativa restante" e "2 tentativas restantes"
    // mudam duas palavras.
    'code.lives.remaining': '{count} tentativas restantes',
    'code.lives.remainingOne': '1 tentativa restante',
    'code.lives.exhausted': 'Suas tentativas acabaram.',
    'code.lives.finalTitle': 'Fim das tentativas',
    'code.lives.answerShown': 'Suas tentativas acabaram — esta é a resposta certa.',
    'code.lives.noAnswer': 'Suas tentativas acabaram. Leia as dicas e siga para a próxima.',
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
    // ── `question` — a pergunta NÃO-AVALIATIVA (2026-08-28, ADR-6) ─────────
    // pt-BR é a língua de primeira classe aqui: o plans-app pergunta em
    // português, e "recomendado" é um MARCADOR do lado de quem pergunta —
    // nunca um "correto".
    // ── scene kinds (xray / live_type / inspect, 2026-09-24) ──
    'activity.xray': 'Raio-X',
    'activity.scene.solved': 'Descoberto!',
    'activity.xray.lens': 'raio-x',
    'activity.xray.progress': '{pct}% escaneado',
    'activity.xray.done': 'escaneado',
    'activity.xray.hint.mouse': 'Passe o mouse aqui',
    'activity.xray.hint.touch': 'Passe o dedo aqui',
    'activity.liveType': 'Digite ao vivo',
    'activity.liveType.inputLabel': 'Texto dentro da tag',
    'activity.inspect': 'Descubra as peças',
    'activity.inspect.is': 'é',
    'activity.xray.stage': 'Lente de raio-X',
    'activity.xray.keyboard': 'Use as setas para mover a lente sobre a página',
    'activity.inspect.pageTarget': 'Elemento da página: {name}',
    'activity.inspect.codeTarget': 'Linha do código: {name}',
    // ── scene-mechanics batch, batch A (dial/plug/selector/timeline/arrange/press, 2026-09-25) ──
    'activity.dial': 'Ajuste',
    'activity.plug': 'Liga e desliga',
    'activity.selector': 'Seletor',
    'activity.selector.wrongHint': 'Esse seletor não pega exatamente o que a gente quer.',
    'activity.timeline': 'Linha do tempo',
    'activity.arrange': 'Organize',
    'activity.press': 'Aperte',
    // ── scene-mechanics batch, batch B (wire/spot/bucket/intercept/query, 2026-09-25) ──
    'activity.wire': 'Ligue os fios',
    'activity.spot': 'Encontre o bug',
    'activity.bucket': 'Separe nos baldes',
    'activity.intercept': 'Intercepte',
    'activity.query': 'Consulta',
    'activity.query.goalReached': 'meta alcançada',
    'activity.query.goalPending': 'ainda não é isso',
    // ── system kinds (decompose_canvas/compose_blocks/state_lab/event_trace, 2026-09-30) ──
    'activity.decomposeCanvas': 'Decomponha',
    'activity.decomposeCanvas.selectHint': 'Toque nos elementos que andam juntos e escolha a parte deles.',
    'activity.decomposeCanvas.selected': '{count} selecionado(s) — agora escolha a parte',
    'activity.decomposeCanvas.verify': 'Verificar',
    'activity.decomposeCanvas.reset': 'Recomeçar',
    'activity.decomposeCanvas.unassigned': 'Ainda falta dar uma parte a {count} elemento(s).',
    'activity.decomposeCanvas.wrongHint': 'Essa divisão ainda mistura partes com trabalhos diferentes.',
    'activity.decomposeCanvas.unassign': 'Tirar da parte',
    'activity.decomposeCanvas.clearSelection': 'Limpar seleção',
    'activity.scene.tryAgainTitle': 'Quase lá',
    'activity.scene.tryAgain': 'Tentar de novo',
    'activity.scene.hitTitle': 'Boa!',
    'activity.scene.gotIt': 'Entendi',
    'activity.video.optional': 'Prefere ver em vídeo?',
    'activity.composeBlocks': 'Monte',
    'activity.composeBlocks.palette': 'Blocos',
    'activity.composeBlocks.tree': 'Estrutura',
    'activity.composeBlocks.preview': 'Prévia',
    'activity.composeBlocks.placeHere': 'Soltar aqui',
    'activity.composeBlocks.pickFirst': 'Arraste um bloco até o lugar dele, ou toque no bloco e depois no lugar.',
    'activity.composeBlocks.remove': 'Remover {name}',
    'activity.composeBlocks.wrongHint': 'Esse bloco não entra aí.',
    'activity.stateLab': 'Laboratório de estado',
    'activity.stateLab.state': 'Estado',
    'activity.stateLab.goals': 'Metas',
    'activity.eventTrace': 'Siga o evento',
    'activity.eventTrace.trigger': 'Toque no elemento destacado para disparar o evento.',
    'activity.eventTrace.frozen': 'Execução pausada',
    'activity.eventTrace.next': 'Próximo passo',
    'activity.eventTrace.lens.event': 'evento',
    'activity.eventTrace.lens.action': 'ação',
    'activity.eventTrace.lens.state': 'estado',
    'activity.eventTrace.lens.render': 'render',
    'activity.eventTrace.panel.structure': 'Estrutura',
    'activity.eventTrace.panel.state': 'Estado',
    'activity.eventTrace.panel.flow': 'Fluxo',
    'activity.question': 'Pergunta',
    'activity.question.pickOne': 'Escolha uma opção, ou escreva a sua',
    'activity.question.pickAny': 'Escolha quantas opções quiser, ou escreva a sua',
    'activity.judgeUnavailable': 'A correção por IA não está disponível aqui. Esta atividade precisa dela para ser concluída.',
    'activity.question.pickOneOnly': 'Escolha uma opção',
    'activity.question.pickAnyOnly': 'Escolha quantas opções quiser',
    'activity.specInvalid': 'Esta atividade está com a configuração inválida e não pôde ser carregada.',
    'activity.question.recommended': 'recomendado',
    'activity.question.other': 'Outro',
    'activity.question.notesLabel': 'Notas (opcional)',
    'activity.question.notesPlaceholder': 'Escreva aqui o que você pensa…',
    'activity.reflectionPlaceholder': 'Escreva aqui o que você aprendeu…',
    'activity.words': 'palavras',
    'quiz.trueOrFalse': 'Verdadeiro ou falso?',
    'activity.done': 'Concluída',
    'activity.explanationTitle': 'Entenda o porquê',
    'activity.instructionZoomClose': 'Fechar',
    'activity.instructionZoomOpen': 'Ampliar a imagem',
    'activity.mediaHoverOff': 'Desligar a prévia ao passar o mouse',
    'activity.mediaHoverOn': 'Ligar a prévia ao passar o mouse',
    'activity.mediaZoomIn': 'Aproximar a imagem',
    'activity.mediaZoomOut': 'Ver a imagem inteira',
    'activity.markDone': 'Marcar como concluída',
    'activity.match': 'Associação',
    'activity.matchHint': 'Toque num card e depois no seu par, ou arraste a linha',
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
    'code.lives.remaining': '{count} attempts left',
    'code.lives.remainingOne': '1 attempt left',
    'code.lives.exhausted': 'You are out of attempts.',
    'code.lives.finalTitle': 'Out of attempts',
    'code.lives.answerShown': 'You are out of attempts — this is the right answer.',
    'code.lives.noAnswer': 'You are out of attempts. Read the hints and move on.',
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
    'activity.xray': 'X-ray',
    'activity.scene.solved': 'Discovered!',
    'activity.xray.lens': 'x-ray',
    'activity.xray.progress': '{pct}% scanned',
    'activity.xray.done': 'scanned',
    'activity.xray.hint.mouse': 'Move the mouse here',
    'activity.xray.hint.touch': 'Slide your finger here',
    'activity.liveType': 'Live typing',
    'activity.liveType.inputLabel': 'Text inside the tag',
    'activity.inspect': 'Find the pieces',
    'activity.inspect.is': 'is',
    'activity.xray.stage': 'X-ray lens',
    'activity.xray.keyboard': 'Use the arrow keys to move the lens over the page',
    'activity.inspect.pageTarget': 'Page element: {name}',
    'activity.inspect.codeTarget': 'Source line: {name}',
    // ── scene-mechanics batch, batch A (dial/plug/selector/timeline/arrange/press, 2026-09-25) ──
    'activity.dial': 'Dial',
    'activity.plug': 'On and off',
    'activity.selector': 'Selector',
    'activity.selector.wrongHint': 'That selector does not name exactly what we want.',
    'activity.timeline': 'Timeline',
    'activity.arrange': 'Arrange',
    'activity.press': 'Press',
    // ── scene-mechanics batch, batch B (wire/spot/bucket/intercept/query, 2026-09-25) ──
    'activity.wire': 'Wire it up',
    'activity.spot': 'Spot the bug',
    'activity.bucket': 'Sort into buckets',
    'activity.intercept': 'Intercept',
    'activity.query': 'Query',
    'activity.query.goalReached': 'goal reached',
    'activity.query.goalPending': 'not yet',
    // ── system kinds (decompose_canvas/compose_blocks/state_lab/event_trace, 2026-09-30) ──
    'activity.decomposeCanvas': 'Decompose',
    'activity.decomposeCanvas.selectHint': 'Tap the elements that belong together, then pick their part.',
    'activity.decomposeCanvas.selected': '{count} selected — now pick their part',
    'activity.decomposeCanvas.verify': 'Check',
    'activity.decomposeCanvas.reset': 'Start over',
    'activity.decomposeCanvas.unassigned': '{count} element(s) still have no part.',
    'activity.decomposeCanvas.wrongHint': 'This split still mixes parts that do different jobs.',
    'activity.decomposeCanvas.unassign': 'Remove from part',
    'activity.decomposeCanvas.clearSelection': 'Clear selection',
    'activity.scene.tryAgainTitle': 'Almost there',
    'activity.scene.tryAgain': 'Try again',
    'activity.scene.hitTitle': 'Nice!',
    'activity.scene.gotIt': 'Got it',
    'activity.video.optional': 'Rather watch a video?',
    'activity.composeBlocks': 'Compose',
    'activity.composeBlocks.palette': 'Blocks',
    'activity.composeBlocks.tree': 'Structure',
    'activity.composeBlocks.preview': 'Preview',
    'activity.composeBlocks.placeHere': 'Drop here',
    'activity.composeBlocks.pickFirst': 'Drag a block to its place, or tap the block and then the place.',
    'activity.composeBlocks.remove': 'Remove {name}',
    'activity.composeBlocks.wrongHint': 'That block does not go there.',
    'activity.stateLab': 'State lab',
    'activity.stateLab.state': 'State',
    'activity.stateLab.goals': 'Goals',
    'activity.eventTrace': 'Trace the event',
    'activity.eventTrace.trigger': 'Tap the highlighted element to fire the event.',
    'activity.eventTrace.frozen': 'Execution paused',
    'activity.eventTrace.next': 'Next step',
    'activity.eventTrace.lens.event': 'event',
    'activity.eventTrace.lens.action': 'action',
    'activity.eventTrace.lens.state': 'state',
    'activity.eventTrace.lens.render': 'render',
    'activity.eventTrace.panel.structure': 'Structure',
    'activity.eventTrace.panel.state': 'State',
    'activity.eventTrace.panel.flow': 'Flow',
    'activity.question': 'Question',
    'activity.question.pickOne': 'Pick one option, or write your own',
    'activity.question.pickAny': 'Pick as many options as you want, or write your own',
    'activity.judgeUnavailable': 'AI grading is not available here. This activity needs it to be completed.',
    'activity.question.pickOneOnly': 'Pick one option',
    'activity.question.pickAnyOnly': 'Pick as many options as you want',
    'activity.specInvalid': 'This activity has an invalid configuration and could not be loaded.',
    'activity.question.recommended': 'recommended',
    'activity.question.other': 'Other',
    'activity.question.notesLabel': 'Notes (optional)',
    'activity.question.notesPlaceholder': 'Write what you think…',
    'activity.reflectionPlaceholder': 'Write what you learned here…',
    'activity.words': 'words',
    'quiz.trueOrFalse': 'True or false?',
    'activity.done': 'Done',
    'activity.explanationTitle': 'Here is why',
    'activity.instructionZoomClose': 'Close',
    'activity.instructionZoomOpen': 'Zoom in on the image',
    'activity.mediaHoverOff': 'Turn off the hover preview',
    'activity.mediaHoverOn': 'Turn on the hover preview',
    'activity.mediaZoomIn': 'Zoom in',
    'activity.mediaZoomOut': 'Fit the whole image',
    'activity.markDone': 'Mark as done',
    'activity.match': 'Match',
    'activity.matchHint': 'Tap a card, then its pair, or drag the line',
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
