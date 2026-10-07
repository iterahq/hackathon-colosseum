/**
 * The colours and the card styles the shell draws before the web document exists, in one place. Plain objects, no
 * `react-native` import (a non-chrome `.ts` under `src/` may not have one, one-copy rule 1): each card passes them to its own
 * `StyleSheet.create`, together with `StyleSheet.absoluteFill`.
 */
export const BACKGROUND = '#0A0908';
export const FOREGROUND = '#F5F1EA';
const MUTED = '#C9C3B8';

export const CARD_STYLES = {
  fill: { backgroundColor: BACKGROUND, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: FOREGROUND, fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  body: { color: MUTED, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  button: { height: 48, minWidth: 240, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primary: { backgroundColor: FOREGROUND },
  primaryText: { color: BACKGROUND, fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: FOREGROUND },
  secondaryText: { color: FOREGROUND, fontSize: 16 },
} as const;
