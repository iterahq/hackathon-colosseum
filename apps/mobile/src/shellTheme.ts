/**
 * Every colour the shell draws before the web document exists, in one place, and the card styles built from them. The cards, the veil,
 * the dev strip, the layout and the route hold no colour literal: they import a name from here (`shellTheme.test.ts` greps them).
 *
 * The values come from the shared theme (`packages/screens/theme/theme.css` `@theme` and `tokens.css` `.dark`), the same ones the web app
 * paints with. `TOKEN_CLAIMS` names the token each one claims; the test fails when the theme moves and this file does not follow.
 * Two text colours are NOT tokens: the theme's muted ink (#7D7568) is 4.37:1 on the background, under AA (4.5:1) for the 14 and 16 px text
 * the cards use, so the cards keep two lighter muted values that pass (`MUTED_BODY`, `MUTED_DETAIL`).
 *
 * Plain objects, no `react-native` import (a non-chrome `.ts` under `src/` may not have one, one-copy rule 1): each card passes the
 * styles to its own `StyleSheet.create`, together with `StyleSheet.absoluteFill`.
 */
/** `--color-brand-bg` / `--background`. */
export const BACKGROUND = '#0A0908';
/** `--color-ink` / `--foreground`: titles, the primary button, the button outline. */
export const INK = '#F4EDE2';
/** `--color-evergreen` / `--primary`: the sliding bar of the veil. */
export const ACCENT = '#3FD17F';
/** `--destructive`: a forwarded error in the dev strip. */
export const DANGER = '#FF5470';
/** Not a token (theme muted fails AA): the body text of a card, 11.35:1 on the background. */
export const MUTED_BODY = '#C9C3B8';
/** Not a token (theme muted fails AA): the quieter line of the update card, 5.73:1 on the background. */
export const MUTED_DETAIL = '#8F897E';
/** The dev strip: the background at 85% (0xD9). */
export const STRIP_BACKGROUND = `${BACKGROUND}D9`;
/** The outline of the secondary button: the ink (the theme's hairline border, #262320, is 1.27:1 and would not mark the control). */
export const BUTTON_BORDER = INK;

/** Which theme token each theme-coloured value claims: `css` is the file, `token` the custom property. */
export const TOKEN_CLAIMS = [
  { name: 'BACKGROUND', value: BACKGROUND, css: 'theme.css', token: '--color-brand-bg' },
  { name: 'BACKGROUND', value: BACKGROUND, css: 'tokens.css', token: '--background' },
  { name: 'INK', value: INK, css: 'theme.css', token: '--color-ink' },
  { name: 'INK', value: INK, css: 'tokens.css', token: '--foreground' },
  { name: 'ACCENT', value: ACCENT, css: 'theme.css', token: '--color-evergreen' },
  { name: 'ACCENT', value: ACCENT, css: 'tokens.css', token: '--primary' },
  { name: 'DANGER', value: DANGER, css: 'tokens.css', token: '--destructive' },
] as const;

export const CARD_STYLES = {
  fill: { backgroundColor: BACKGROUND, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: INK, fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  body: { color: MUTED_BODY, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  detail: { color: MUTED_DETAIL, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 24 },
  button: { height: 48, minWidth: 240, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primary: { backgroundColor: INK },
  primaryText: { color: BACKGROUND, fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: BUTTON_BORDER },
  secondaryText: { color: INK, fontSize: 16 },
} as const;

export const VEIL_STYLES = {
  fill: { backgroundColor: BACKGROUND },
  bar: { backgroundColor: ACCENT },
  monogram: { color: INK },
} as const;

export const DEV_STYLES = {
  strip: { backgroundColor: STRIP_BACKGROUND },
  text: { color: INK },
  error: { color: DANGER },
} as const;
