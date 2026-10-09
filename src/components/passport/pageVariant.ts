import type { PassportPageData } from '@/types/achievements';
import { TRAIL_COLORS } from '@/utils/trailDashboard';
import { isGold } from '@/utils/passport';
import type { PageVariant } from './PassportPage';

export const pageVariant = (p: PassportPageData): PageVariant => (p.locked ? 'locked' : isGold(p) ? 'gold' : p.daysDone === 0 ? 'fresh' : 'active');

export const pageColor = (p: PassportPageData) => TRAIL_COLORS[p.colorIndex % TRAIL_COLORS.length];
