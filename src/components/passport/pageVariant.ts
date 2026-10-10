import type { PassportPageData } from '@/types/achievements';
import { credentialImageUrl } from '@/services/credential.service';
import { TRAIL_COLORS } from '@/utils/trailDashboard';
import { isGold } from '@/utils/passport';
import type { PageVariant } from './PassportPage';

export const pageVariant = (p: PassportPageData): PageVariant => (p.locked ? 'locked' : isGold(p) ? 'gold' : p.daysDone === 0 ? 'fresh' : 'active');

export const pageColor = (p: PassportPageData) => TRAIL_COLORS[p.colorIndex % TRAIL_COLORS.length];

/** The backend-drawn art of a started certification that has a stored row; null for placeholders. */
export const pageArtSrc = (p: PassportPageData, lang: string): string | null =>
  p.credentialId && !p.locked && p.daysDone > 0 ? credentialImageUrl(p.credentialId, lang, `${p.daysDone}-${p.tier ?? ''}`) : null;
