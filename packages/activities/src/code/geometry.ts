/**
 * The split-pane geometry the learner's own code pane and its twin on a live
 * stage MUST share.
 *
 * Exported as tokens instead of repeated literals because the two panes are
 * declared in different files — `./CodeSnackPane.tsx` here, and in the Itera
 * Player `src/components/live/LiveStageBody.tsx` — and the live-class cursor
 * mirror normalizes the learner's pointer to 0..1 AGAINST THE PANE BOX
 * (`@/utils/stageCursorDom`). Boxes of different shape make those coordinates
 * lie: restyle one side alone and a pointer on the learner's line 9 lands on
 * line 15 for the whole class — a miss small enough to read as "the feature is
 * flaky" rather than as a regression anyone would bisect.
 * `src/test/LiveStageCursor.test.tsx` asserts both panes against these tokens,
 * so the contract cannot go stale.
 *
 * They live in the PACKAGE and not in the app because the pane they describe
 * does: `@/utils/codeStageGeometry` is a re-export of this module, so the mirror
 * half stays free to import by the app path it always used while there is still
 * exactly one source of truth. A second copy on the app side would restore the
 * drift these tokens exist to prevent, in the quietest possible way — two files
 * that agree today.
 *
 * Public on the `/code` surface for that reason alone: a consumer that mirrors a
 * learner's pane needs the same classes, not an approximation of them. Nothing
 * here is a theming seam — see `ActivityTheme` for that.
 */

/**
 * Fluid, replacing the fixed `h-[360px]` both panes used to carry. Measured on
 * the 06/08 class: at 360px a 1080p projector spent two thirds of its height on
 * empty background while the code the class came to read sat in a small
 * rectangle. The floor keeps a real editor usable on a laptop and the ceiling
 * stops it outgrowing the page on a 4K screen.
 *
 * On a phone the two panes stack, so the floor alone was 720 px of panes on a
 * 640 px screen: there the code activity shows one pane at a time, 264 px high. On a screen
 * 800 px high or less (`short:`) the panes take what the lesson chrome leaves, so
 * the editor, the result and the button under them share the screen.
 */
export const CODE_PANE_BOX = 'h-[clamp(360px,55vh,720px)] max-sm:h-[264px] short:h-[max(300px,calc(100vh-25.5rem))] overflow-hidden rounded-2xl';

/**
 * The panes' height when the instruction sits BESIDE them (the self-paced
 * lesson, a long instruction, a wide screen): what the lesson chrome, the reset
 * control and the submit button leave of the screen. Only ever added next to
 * `CODE_PANE_BOX`, never instead of it.
 */
export const CODE_PANE_SIDE_HEIGHT = 'h-[clamp(360px,calc(100dvh-20rem),760px)]!';

/**
 * 60/40 in favour of the editor (call de 06/08: "aproveitar mais espaço, 60%
 * código 40% render"), as fifths — the closest split Tailwind expresses without
 * arbitrary fractions.
 */
export const CODE_SPLIT_GRID = 'grid grid-cols-1 md:grid-cols-5 gap-4';
export const CODE_SPLIT_EDITOR = 'md:col-span-3';
export const CODE_SPLIT_PREVIEW = 'md:col-span-2';
