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
    'activity.selectAll': 'Selecione todas as corretas',
    'activity.sent': 'Enviado',
    'activity.singleChoice': 'Escolha única',
    'activity.submit': 'Enviar',
    'activity.video': 'Vídeo',
    'activity.video.missing': 'Vídeo não configurado',
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
    'activity.selectAll': 'Select all that apply',
    'activity.sent': 'Sent',
    'activity.singleChoice': 'Single choice',
    'activity.submit': 'Submit',
    'activity.video': 'Video',
    'activity.video.missing': 'No video configured',
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
