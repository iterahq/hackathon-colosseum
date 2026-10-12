import type { TeamMember } from '@/types/landing';

/**
 * What the landing may state about the product and the people. Only facts from the README and the owner's
 * pitch notes; a value only the owner can supply stays `null` and its slot stays hidden until it exists.
 */

/** The 2-minute pitch video. OWNER MUST SUPPLY: the public URL once recorded. */
export const PITCH_VIDEO_URL: string | null = null;

/** The public "verify it yourself" page (LANE A). Hidden until it is live on main. */
export const VERIFY_PATH = '/verify';
export const GATE_PATH = '/verify#gate';
export const VERIFY_PAGE_LIVE = true;

export const TEAM: readonly [TeamMember, TeamMember] = [{ name: 'Samuel Stefano' }, { name: 'Tainan Fidelis' }];
