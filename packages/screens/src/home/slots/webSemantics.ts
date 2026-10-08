import { Platform, type Role } from 'react-native';

/**
 * The places where the web DOM of the old page has no React Native counterpart.
 * Derived from `catalog/slots/webSemantics.ts`.
 */

/** react-native-web renders `role="paragraph"` as `<p>`. React Native has no such role. */
export const PARAGRAPH = Platform.OS === 'web' ? ('paragraph' as Role) : undefined;

/**
 * The hero title grows with the window on the web, as on the old page (28 px to 44 px). React Native has no
 * viewport unit: there the size comes from the classes of the title.
 */
export const HERO_TITLE_SIZE = (Platform.OS === 'web' ? { fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)' } : {}) as { fontSize?: number };
