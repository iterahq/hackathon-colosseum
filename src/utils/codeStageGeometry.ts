/**
 * MOVED — the code pane's split geometry now lives in `@iterahq/activities/code`
 * (Fase C, step 5).
 *
 * It went where `CodeSnackPane` went, because that pane is one of the two halves
 * the tokens describe. A copy on this side would mean two files that have to
 * agree forever about the box the live cursor normalizes against — exactly the
 * drift the tokens exist to prevent, and the version of it that is hardest to
 * notice, since the two would agree on the day someone wrote them.
 *
 * Kept as the app's import path because the MIRROR half is the app's
 * (`src/components/live/LiveStageBody.tsx`), and so is the test that pins both
 * panes to the same classes (`src/test/LiveStageCursor.test.tsx`).
 */
export {
  CODE_PANE_BOX,
  CODE_SPLIT_EDITOR,
  CODE_SPLIT_GRID,
  CODE_SPLIT_PREVIEW,
} from '@iterahq/activities/code';
