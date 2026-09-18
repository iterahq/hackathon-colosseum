import type { I18nText } from './content';

/**
 * The minimal shape `CatalogProgramCard` renders. Both `CatalogProgram`
 * (discovery) and the enrolled `Program` type satisfy it structurally.
 */
export interface CatalogProgramCardData {
  id: string;
  title: I18nText;
  icon?: string;
  unitCount?: number;
  lessonCount?: number;
  activityCount?: number;
}
