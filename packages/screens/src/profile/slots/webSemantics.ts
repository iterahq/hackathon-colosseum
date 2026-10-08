import { Platform, type Role } from 'react-native';
import type { NavigationIntent } from '@iterahq/shell-core';

/**
 * The places where the web DOM of the old page has no React Native counterpart.
 * Derived from `not-found/slots/webSemantics.ts`.
 */

const WEB = Platform.OS === 'web';

/** react-native-web renders `role="paragraph"` as `<p>`. React Native has no such role. */
export const PARAGRAPH = WEB ? ('paragraph' as Role) : undefined;

/** A label inside a control takes the control's colour on the web (so its hover reaches it); a native `Text` inherits from no `View`. */
export const MUTED_CONTROL_TEXT = WEB ? 'text-inherit' : 'text-muted-foreground';

/** The web shows the "not allowed" cursor over a disabled button; a phone has no cursor. */
export const DISABLED_CURSOR = WEB ? 'cursor-not-allowed' : '';

/** A toggled choice: `aria-pressed` on the web (the old buttons), `aria-selected` where React Native has no pressed state. */
export function chosenProps(chosen: boolean): object {
  return WEB ? { 'aria-pressed': chosen } : { 'aria-selected': chosen };
}

/**
 * A page outside the app. On the web `href` makes react-native-web render an `<a>` that opens a new tab
 * (inside the shell's WebView the shell hands that navigation to the system browser). The shell's own
 * screen has no anchor: the press runs the intent.
 */
export function externalLinkProps(intent: NavigationIntent): object {
  return WEB ? { href: intent.href, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } : { onPress: intent.go };
}

/**
 * react-native-web blurs a one-line field on Enter; the `<input>` of the old page kept the focus. On a phone the
 * return key closes the keyboard, which is what a learner expects there, so React Native keeps its default.
 */
export const KEEP_FOCUS_ON_ENTER: object = WEB ? { blurOnSubmit: false } : {};

/** The grey the web's base layer gives every placeholder; react-native-web and React Native would use the text colour. */
export const PLACEHOLDER_COLOR = '#9ca3af';
