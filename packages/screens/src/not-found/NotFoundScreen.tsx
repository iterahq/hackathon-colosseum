/**
 * The page of an unknown route, written once for the web and for the shell.
 * The markup and the classes are the ones of the deleted `src/pages/NotFound.tsx`; a text node
 * names its font, size and colour because a React Native `Text` inherits none of them.
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import type { LogPort, NavigationIntent, Translate } from '@iterahq/shell-core';
import { linkProps, PARAGRAPH } from './slots/webSemantics';

export interface NotFoundScreenProps {
  /** The path nobody serves. */
  path: string;
  t: Translate;
  log: LogPort;
  home: NavigationIntent;
}

export function NotFoundScreen({ path, t, log, home }: NotFoundScreenProps) {
  useEffect(() => {
    log.error('404 Error: User attempted to access non-existent route:', path);
  }, [log, path]);

  return (
    <View className="flex min-h-screen flex-1 items-center justify-center bg-muted">
      <View>
        {/* No font class: the web styles every h1 with the display face (`src/index.css`, base layer). */}
        <Text role="heading" aria-level={1} className="mb-4 text-center text-4xl font-bold text-foreground">
          {t('notFound.title')}
        </Text>
        <Text role={PARAGRAPH} className="mb-4 text-center font-sans text-xl text-muted-foreground">
          {t('notFound.message')}
        </Text>
        {/* A line box around the link, as the old `<a>` had: the anchor stays inline, so its focus ring hugs the text. */}
        <Text className="text-center font-sans text-base">
          <Text role="link" {...linkProps(home)} className="text-primary underline hover:text-primary/90">
            {t('notFound.returnHome')}
          </Text>
        </Text>
      </View>
    </View>
  );
}
