import { Platform, type Role } from 'react-native';
import type { NavigationIntent } from '@iterahq/shell-core';

/**
 * The places where the web DOM of the old page has no React Native counterpart.
 * Derived from `not-found/slots/webSemantics.ts`.
 */

/** react-native-web renders `role="paragraph"` as `<p>`. React Native has no such role. */
export const PARAGRAPH = Platform.OS === 'web' ? ('paragraph' as Role) : undefined;

interface ClickLike {
  preventDefault?: () => void;
  defaultPrevented?: boolean;
  button?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/**
 * On the web `href` makes react-native-web render an `<a>`: a middle or modified click still opens a tab,
 * a plain click runs `go` (the router, no page load) when the host gave one, and the browser follows the
 * anchor itself when it did not. The shell has no anchor: the press runs the intent.
 */
export function linkProps(intent: NavigationIntent): object {
  if (Platform.OS !== 'web') return { onPress: intent.go };
  return {
    href: intent.href,
    onPress: (event?: ClickLike) => {
      const plain = event && !event.defaultPrevented && !event.button && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (!intent.go || !plain) return;
      event.preventDefault?.();
      intent.go();
    },
  };
}
