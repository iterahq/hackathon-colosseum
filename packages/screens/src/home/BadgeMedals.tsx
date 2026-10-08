/**
 * The learner's medals: a pointy-top hexagon each, lit when earned, dark with a lock when not, its name
 * below. The markup and the classes are those of the web's `BadgeGrid`, which this replaces. The hexagon is
 * a clip path and the lit face a gradient: both are web classes, and React Native draws the box behind them.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { HomeBadgesState, HomeIcon, Translate } from '@iterahq/shell-core';

const HEX = '[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]';
const NOTE = 'py-6 text-center font-sans text-sm leading-5 text-muted-foreground';

export function BadgeMedals({ state, t, icon }: { state: HomeBadgesState; t: Translate; icon: (icon: HomeIcon) => ReactNode }) {
  if (state.kind === 'loading') return <View testID="badges-loading" aria-busy className="ds-shimmer my-4 h-12 w-full rounded-xl" />;
  if (state.kind === 'empty') {
    return (
      <Text testID="badges-empty" className={NOTE}>
        {t('badges.empty')}
      </Text>
    );
  }
  return (
    <View testID="badge-grid" className="-mx-2 flex-row flex-wrap gap-y-7 md:-mx-3">
      {state.badges.map((badge, index) => (
        <View key={badge.id} className="w-1/3 items-center gap-3 px-2 sm:w-1/4 md:w-1/6 md:px-3">
          <View className="relative h-21 w-20">
            {badge.earned && <View aria-hidden className={`pointer-events-none absolute inset-0 scale-110 bg-linear-to-br/srgb from-sky-400 to-indigo-600 opacity-60 blur-md ${HEX}`} />}
            <View aria-hidden className={`absolute inset-0 ${HEX} ${badge.earned ? 'bg-linear-to-br/srgb from-sky-300 to-indigo-700' : 'bg-border'}`} />
            <View className={`absolute inset-[2px] items-center justify-center ${HEX} ${badge.earned ? 'bg-linear-to-br/srgb from-sky-400 to-indigo-600 text-white' : 'bg-obsidiana text-muted-foreground/70'}`}>
              {badge.earned && <View aria-hidden className={`pointer-events-none absolute inset-0 bg-linear-to-b/srgb from-white/35 via-transparent to-transparent ${HEX}`} />}
              {icon({ kind: 'badge', earned: badge.earned, index })}
            </View>
            {badge.earned && (
              <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-evergreen text-obsidiana shadow-xs">
                {icon({ kind: 'badge-check' })}
              </View>
            )}
          </View>
          <Text className={`text-center font-sans text-[12px] leading-tight ${badge.earned ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{badge.title}</Text>
        </View>
      ))}
    </View>
  );
}
