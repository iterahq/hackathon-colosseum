import { transitionKindOf } from '@iterahq/activities';

/**
 * The i18n key of the kind eyebrow under a trail node. The dictionary names
 * kinds in camelCase (`activity.singleChoice`), the database in snake_case, and
 * a one-behaviour kind borrows the label of the kind it came from.
 */
export function kindLabelKey(kind: string): string {
  return `activity.${transitionKindOf(kind).replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`;
}
