import {
  Accessibility,
  AlignVerticalJustifyCenter,
  Anchor,
  Braces,
  CodeXml,
  Columns3,
  Crosshair,
  FileCode2,
  GitBranch,
  Globe,
  Layers,
  LayoutTemplate,
  Link2,
  ListTree,
  Lock,
  MousePointerClick,
  Paintbrush,
  Palette,
  PenLine,
  Rocket,
  Ruler,
  Send,
  Smartphone,
  Sparkles,
  SquareDashed,
  SquareFunction,
  SquarePlus,
  Table2,
  Tag,
  Terminal,
  TextCursorInput,
  Variable,
  WrapText,
  type LucideIcon,
} from 'lucide-react';

export type SkillFamily = 'html' | 'css' | 'js' | 'other';
export type SkillBadgeState = 'lit' | 'locked' | 'neutral';

const FAMILIES: readonly Exclude<SkillFamily, 'other'>[] = ['html', 'css', 'js'];

const FAMILY_ICON: Record<SkillFamily, LucideIcon> = {
  html: CodeXml,
  css: Palette,
  js: Braces,
  other: Sparkles,
};

/** One glyph per claim of the capability graph, so a row of badges is told apart at a glance. */
const CLAIM_ICON: Record<string, LucideIcon> = {
  'html-tags': Tag,
  'html-skeleton': FileCode2,
  'html-nesting': ListTree,
  'html-attrs': Link2,
  'html-semantic': LayoutTemplate,
  'html-anchors': Anchor,
  'html-table': Table2,
  'html-form': TextCursorInput,
  'html-a11y': Accessibility,
  'html-publish': Globe,
  'css-rules': Paintbrush,
  'css-selectors': Crosshair,
  'css-box': SquareDashed,
  'css-sizing': Ruler,
  'css-flex-row': Columns3,
  'css-flex-align': AlignVerticalJustifyCenter,
  'css-flex-wrap': WrapText,
  'css-cascade': Layers,
  'css-responsive': Smartphone,
  'js-console': Terminal,
  'js-variables': Variable,
  'js-conditions': GitBranch,
  'js-functions': SquareFunction,
  'js-dom-write': PenLine,
  'js-events': MousePointerClick,
  'js-dom-create': SquarePlus,
  'js-forms': Send,
  'js-app': Rocket,
};

export const GLYPH_CLAIM_IDS: readonly string[] = Object.keys(CLAIM_ICON);

/** The family a claim belongs to, read from the prefix of its id (`css-flex-row` is `css`). */
export function skillFamily(claimId: string): SkillFamily {
  const prefix = claimId.split('-', 1)[0];
  return FAMILIES.find((family) => family === prefix) ?? 'other';
}

/** A locked skill shows the padlock; any other state shows the claim's own glyph, or its family's for a claim with none. */
export function skillIcon(claimId: string, state: SkillBadgeState = 'neutral'): LucideIcon {
  if (state === 'locked') return Lock;
  return CLAIM_ICON[claimId] ?? FAMILY_ICON[skillFamily(claimId)];
}
