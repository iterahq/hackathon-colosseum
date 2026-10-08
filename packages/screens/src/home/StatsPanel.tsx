/**
 * The welcome panel of the dashboard: who the learner is and the four counts. The markup and the classes are
 * those of the web's `StatsCard`, which this replaces. Each count has its own accent, on its chip, its glyph
 * and its number.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { HomeIcon, HomeStatsView, Translate } from '@iterahq/shell-core';

type Tile = { icon: 'streak' | 'xp' | 'badges' | 'completed'; label: string; ink: string; chip: string };

const TILES: readonly Tile[] = [
  { icon: 'streak', label: 'stats.streak', ink: 'text-streak', chip: 'bg-streak/10 border-streak/25' },
  { icon: 'xp', label: 'stats.xp', ink: 'text-evergreen-hi', chip: 'bg-evergreen/10 border-evergreen/30' },
  { icon: 'badges', label: 'stats.badges', ink: 'text-warning', chip: 'bg-warning/10 border-warning/25' },
  { icon: 'completed', label: 'stats.completed', ink: 'text-menta', chip: 'bg-menta/10 border-menta/25' },
];

export function StatsPanel({ stats, t, icon }: { stats: HomeStatsView; t: Translate; icon: (icon: HomeIcon) => ReactNode }) {
  return (
    <View testID="stats-card" className="relative flex-1 overflow-hidden rounded-3xl border border-border bg-card p-5 md:p-6">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full border border-evergreen/40 bg-evergreen-soft">
          <Text className="font-display text-base font-bold leading-6 text-evergreen-hi">{stats.initials}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-display text-base font-semibold leading-6 text-foreground">
            {t('home.welcome')}, {stats.name}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <View className="text-evergreen-hi">{icon({ kind: 'crown' })}</View>
            <Text className="font-sans text-xs leading-4 text-muted-foreground">Itera</Text>
          </View>
        </View>
      </View>
      <View className="-m-1.5 mt-[18px] flex-row flex-wrap">
        {TILES.map((tile) => (
          <View key={tile.icon} className="w-1/2 p-1.5 sm:w-1/4">
            <View className="rounded-2xl border border-border bg-obsidiana/60 p-3">
              <View className={`h-8 w-8 items-center justify-center rounded-xl border ${tile.chip} ${tile.ink}`}>{icon({ kind: tile.icon })}</View>
              <Text className={`font-display mt-2.5 text-2xl font-bold leading-8 ${tile.ink}`}>{stats[tile.icon]}</Text>
              <Text className="mt-0.5 wrap-normal font-mono text-[11px] uppercase leading-[16.5px] tracking-wider text-muted-foreground">{t(tile.label)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
