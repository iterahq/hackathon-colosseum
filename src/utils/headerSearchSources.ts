import type { AchievementView } from '@/types/achievements';
import type { SearchSource } from '@/types/headerSearch';
import type { Trail } from '@/types/trailDashboard';
import { trailHref } from '@/utils/courses';
import { currentDayOf, dayName, trailName } from '@/utils/trailDashboard';

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type TranslateText = (bag: Record<string, string | undefined> | null | undefined) => string;

export interface HeaderSearchData {
  t: Translate;
  tText: TranslateText;
  trails: readonly Trail[];
  featured: Trail | null;
  achievements: readonly AchievementView[];
}

/** The learner pages the palette can open; a fixed list, so it needs no data. */
export function pagesSource(t: Translate): SearchSource {
  return {
    id: 'pages',
    label: t('search.group.pages'),
    entries: [
      { id: 'page-trails', title: t('header.nav.trails'), href: '/', icon: 'trails', suggested: true },
      { id: 'page-courses', title: t('header.nav.courses'), href: '/catalog', icon: 'courses', suggested: true },
      { id: 'page-passport', title: t('header.nav.passport'), href: '/passport', icon: 'passport', keywords: ['passport', 'credential'], suggested: true },
      { id: 'page-files', title: t('header.nav.files'), href: '/artifacts', icon: 'files', keywords: ['files', 'arquivos', 'repositorio'], suggested: true },
      { id: 'page-profile', title: t('header.id.profile'), href: '/profile', icon: 'star', keywords: ['profile', 'conta', 'account'], suggested: true },
    ],
  };
}

/** The day a learner would continue today, offered on an empty query. */
export function continueSource({ t, tText, featured }: HeaderSearchData): SearchSource | null {
  const day = featured ? currentDayOf(featured) : null;
  if (!featured || !day) return null;
  return {
    id: 'continue',
    label: t('search.group.continue'),
    suggestOnly: true,
    entries: [{ id: `continue-${day.id}`, title: tText(dayName(day.title)), subtitle: tText(trailName(featured.title)), href: `/lesson/${day.id}`, icon: 'bolt', suggested: true }],
  };
}

export function trailsSource({ t, tText, trails }: HeaderSearchData): SearchSource {
  return {
    id: 'trails',
    label: t('search.group.trails'),
    entries: trails.map((trail) => ({
      id: `trail-${trail.id}`,
      title: tText(trailName(trail.title)),
      subtitle: tText(trail.programTitle),
      href: trailHref(trail.programSlug, trail.id),
      icon: 'trails' as const,
    })),
  };
}

/** Days of every trail; a day is open unless its trail is locked or it is not yet reached. */
export function daysSource({ t, tText, trails }: HeaderSearchData): SearchSource {
  return {
    id: 'days',
    label: t('search.group.days'),
    entries: trails.flatMap((trail) =>
      trail.days.map((day) => ({
        id: `day-${day.id}`,
        title: tText(dayName(day.title)),
        subtitle: tText(trailName(trail.title)),
        href: `/lesson/${day.id}`,
        icon: 'day' as const,
        disabled: trail.status === 'locked' || day.state === 'upcoming',
      })),
    ),
  };
}

export function achievementsSource({ t, tText, achievements }: HeaderSearchData): SearchSource {
  return {
    id: 'achievements',
    label: t('search.group.achievements'),
    entries: achievements.map((a) => ({
      id: `achievement-${a.key}`,
      title: tText(a.title),
      subtitle: a.earned ? t('search.earned') : t('search.notEarned'),
      keywords: [tText(a.description)],
      href: '/passport',
      icon: 'medal' as const,
    })),
  };
}

/** Every source of the header palette, in the order the groups are drawn. */
export function buildHeaderSources(data: HeaderSearchData): SearchSource[] {
  const cont = continueSource(data);
  return [...(cont ? [cont] : []), pagesSource(data.t), trailsSource(data), daysSource(data), achievementsSource(data)];
}
