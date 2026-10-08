import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LEGAL_HELP_LINK_IDS, type LegalHelpLinkId, type NavigationIntent, type ProfileIcon, type Translate } from '@iterahq/shell-core';
import { FOCUS_RING } from '../catalog/focusRing';
import { externalLinkProps } from './slots/webSemantics';

export interface LegalHelpCardProps {
  t: Translate;
  links: Record<LegalHelpLinkId, NavigationIntent>;
  icon: (icon: ProfileIcon) => ReactNode;
}

/** Privacy policy, terms of use and support: three rows that leave the app for the public pages. */
export function LegalHelpCard({ t, links, icon }: LegalHelpCardProps) {
  return (
    <View testID="profile-legal-help" className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-8">
      <Text role="heading" aria-level={2} className="font-display text-xl text-foreground">
        {t('profile.legal.title')}
      </Text>
      <View className="mt-4">
        {LEGAL_HELP_LINK_IDS.map((id, index) => (
          <Pressable
            key={id}
            role="link"
            testID={`profile-legal-${id}`}
            {...externalLinkProps(links[id])}
            className={`h-12 flex-row items-center justify-between gap-3 text-muted-foreground hover:text-foreground ${FOCUS_RING} ${index === 0 ? '' : 'border-t border-border'}`}
          >
            <Text className="font-sans text-sm text-foreground">{t(`profile.legal.${id}`)}</Text>
            {icon({ kind: 'external' })}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
