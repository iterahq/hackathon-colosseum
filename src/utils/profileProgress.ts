import type { ProfileCertification } from '@/types/learnerProfile';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The subtitle of a public profile, derived from what is stamped: never a mood or a slogan that contradicts a gold page. */
export function profileProgress(certifications: readonly Pick<ProfileCertification, 'daysDone' | 'totalDays'>[], t: Translate): string {
  const done = certifications.reduce((n, c) => n + c.daysDone, 0);
  const total = certifications.reduce((n, c) => n + c.totalDays, 0);
  if (certifications.length === 0 || total === 0) return t('profile.progress.none');
  if (certifications.length === 1) return t('profile.progress.one', { done, total });
  return t('profile.progress', { done, total, trails: certifications.length });
}
