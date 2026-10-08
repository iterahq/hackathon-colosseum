import type { ComponentType, ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';

/**
 * The outermost box of a screen. On the web the document scrolls, as under the page this replaced, so it is
 * a plain box at least one window tall. React Native has no document: a box taller than the window is cut,
 * so there the page is a scroll view whose content is at least one window tall (the footer stays at the foot).
 */
export const Page = (Platform.OS === 'web' ? View : ScrollView) as ComponentType<{ children?: ReactNode }>;
export const PAGE_PROPS: object =
  Platform.OS === 'web' ? { className: 'min-h-screen flex-1 bg-background' } : { className: 'flex-1 bg-background', contentContainerClassName: 'min-h-full' };
