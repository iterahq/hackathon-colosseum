/**
 * A surface the learner presses, holds, drags or taps on text. Without it a
 * long press on iOS selects the text under the finger and raises the
 * Copy / Look Up callout, or "Save image" on a picture.
 *
 * Class strings on purpose: the package ships no stylesheet, so a host only
 * gets the declarations its Tailwind build finds in these files, and an
 * arbitrary property compiles the same on Tailwind 3 and 4.
 *
 * Never wrap an input, a textarea or an editor with it: `user-select: none`
 * on an ancestor breaks the caret in iOS Safari.
 */
export const TOUCH_SURFACE =
  'select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] [&_img]:[-webkit-user-drag:none]';
