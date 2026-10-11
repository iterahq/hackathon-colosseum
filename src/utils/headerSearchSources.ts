import type { AchievementView } from '@/types/achievements';
import type { SearchSource } from '@/types/headerSearch';
import type { VideoCourse } from '@/types/videoCourses';
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
  videoCourses?: readonly VideoCourse[];
  /** False on the focus build: the courses page is not offered. */
  courses?: boolean;
}

/** The learner pages the palette can open; a fixed list, so it needs no data. */
export function pagesSource(t: Translate, courses = true): SearchSource {
  return {
    id: 'pages',
    label: t('search.group.pages'),
    entries: [
      { id: 'page-trails', title: t('header.nav.trails'), href: '/', icon: 'trails', suggested: true },
      ...(courses ? [{ id: 'page-courses', title: t('header.nav.courses'), href: '/catalog', icon: 'courses' as const, suggested: true }] : []),
      { id: 'page-passport', title: t('header.nav.passport'), href: '/passport', icon: 'passport', keywords: ['passport', 'credential'], suggested: true },
      { id: 'page-bounties', title: t('header.nav.bounties'), href: '/bounties', icon: 'solana', keywords: ['bounty', 'bounties', 'earn', 'sol'], suggested: true },
      { id: 'page-shop', title: t('header.nav.shop'), href: '/shop', icon: 'shop', keywords: ['shop', 'loja', 'avatar'], suggested: true },
      { id: 'page-verify', title: t('header.nav.verify'), href: '/verify', icon: 'verify', keywords: ['verify', 'verificar', 'chain', 'program'], suggested: true },
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

export function videoCoursesSource({ t, videoCourses = [] }: HeaderSearchData): SearchSource {
  return {
    id: 'videos',
    label: t('search.group.videos'),
    entries: videoCourses.map((c) => ({ id: `video-${c.slug}`, title: c.title, subtitle: c.teacherName, href: `/course/${c.slug}`, icon: 'courses' as const })),
  };
}

/** Every source of the header palette, in the order the groups are drawn. */
export function buildHeaderSources(data: HeaderSearchData): SearchSource[] {
  const cont = continueSource(data);
  const courses = data.courses ?? true;
  return [...(cont ? [cont] : []), pagesSource(data.t, courses), trailsSource(data), ...(courses ? [videoCoursesSource(data)] : []), daysSource(data), achievementsSource(data)];
}
