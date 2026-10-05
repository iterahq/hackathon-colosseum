import { Platform, type Role } from 'react-native';
import type { NavigationIntent } from '@iterahq/shell-core';

/**
 * The two places where the web DOM of the old page has no React Native counterpart.
 * Derived from devfellowship/dfl-lesson-studio `packages/screens/src/exports/{text,link}.ts`.
 */

/** react-native-web renders `role="paragraph"` as `<p>`. React Native has no such role. */
export const PARAGRAPH = Platform.OS === 'web' ? ('paragraph' as Role) : undefined;

/**
 * On the web `href` makes react-native-web render an `<a>` that the browser follows by itself.
 * The shell has no anchor: the press runs the intent.
 */
export function linkProps(intent: NavigationIntent): { onPress?: () => void } {
  return Platform.OS === 'web' ? ({ href: intent.href } as object) : { onPress: intent.go };
}
