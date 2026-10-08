import type { ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';

/** The page scrolls with the document on the web; a phone needs its own scroller, one that keeps a tap alive while the keyboard is up. */
export function PageScroll({ className, children }: { className: string; children: ReactNode }) {
  if (Platform.OS === 'web') return <View className={className}>{children}</View>;
  return (
    <ScrollView className="flex-1" contentContainerClassName={className} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
