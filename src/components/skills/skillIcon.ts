import { Braces, CodeXml, Lock, Palette, Sparkles, type LucideIcon } from 'lucide-react';

export type SkillFamily = 'html' | 'css' | 'js' | 'other';
export type SkillBadgeState = 'lit' | 'locked' | 'neutral';

const FAMILIES: readonly Exclude<SkillFamily, 'other'>[] = ['html', 'css', 'js'];

const FAMILY_ICON: Record<SkillFamily, LucideIcon> = {
  html: CodeXml,
  css: Palette,
  js: Braces,
  other: Sparkles,
};

/** The family a claim belongs to, read from the prefix of its id (`css-flex-row` is `css`). */
export function skillFamily(claimId: string): SkillFamily {
  const prefix = claimId.split('-', 1)[0];
  return FAMILIES.find((family) => family === prefix) ?? 'other';
}

/** A locked skill shows the padlock; any other state shows the icon of its family. */
export function skillIcon(claimId: string, state: SkillBadgeState = 'neutral'): LucideIcon {
  return state === 'locked' ? Lock : FAMILY_ICON[skillFamily(claimId)];
}
