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
 * the package's vocabulary, not a mirror of the app's dictionary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS A SECOND PREFIX (`terminal.`) SINCE FASE C STEP 4
 * ─────────────────────────────────────────────────────────────────────────────
 * Until `sandbox_scenario` moved, every key here began with `activity.`, and
 * `src/test/activityDefaultI18n.test.tsx` asserted exactly that. The terminal
 * sandbox arrived with its own 15-key namespace, created by the very refinement
 * (`20260807-itera-terminal-sandbox-refinamentos` §3) that pulled its copy OUT
 * of inline `{ pt, en }` literals and into the dictionary — so renaming those
 * keys to `activity.terminal.*` on the way in would undo a rename someone made
 * on purpose two days ago, and desynchronise this file from the Player's,
 * which is the one thing this dictionary may not do.
 *
 * So the rule is now a short ALLOWLIST of prefixes rather than a single one,
 * and it is still a closed list: `activity.` and `terminal.`. A third prefix is
 * a decision, not an accident, which is exactly what the assertion is for.
 */
import type { ActivityLocale } from '../ports.js';

/** The activity strings this package's renderers ask for, per locale. */
export const ACTIVITY_DICTIONARY: Record<ActivityLocale, Record<string, string>> = {
  pt: {
    'activity.concept': 'Conceito',
    'activity.conceptReveal': 'Pense antes',
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
    'activity.submit': 'Enviar',
    'activity.video': 'Vídeo',
    'activity.video.missing': 'Vídeo não configurado',
    'terminal.buildCommand': 'Monte o comando',
    'terminal.clear': 'Limpar',
    'terminal.empty.freeText': '# digite um comando e aperte Enter',
    'terminal.empty.options': '# monte um comando nas opções abaixo',
    'terminal.hint': 'ver dica',
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
    'activity.conceptReveal': 'Think first',
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
    'activity.submit': 'Submit',
    'activity.video': 'Video',
    'activity.video.missing': 'No video configured',
    'terminal.buildCommand': 'Build the command',
    'terminal.clear': 'Clear',
    'terminal.empty.freeText': '# type a command and press Enter',
    'terminal.empty.options': '# build a command from the options below',
    'terminal.hint': 'see hint',
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
 * the Player's `t` does, even though no key here takes a variable today.
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
