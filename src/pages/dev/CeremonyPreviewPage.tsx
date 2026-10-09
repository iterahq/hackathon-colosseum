import { useSearchParams } from 'react-router-dom';
import { LessonCompleteActions } from '@/components/branded/lesson/LessonCompleteCard';
import { StampCeremony } from '@/components/passport/StampCeremony';
import type { CeremonyStatus } from '@/types/achievements';
import type { CeremonyModel } from '@/utils/ceremony';

const STATES: readonly CeremonyStatus[] = ['minting', 'minted', 'failed', 'no_wallet', 'pending'];

/** Dev-only: every ceremony state from fixtures, no backend. `?state=minting|minted|failed|no_wallet|pending&last=0|1`. */
export default function CeremonyPreviewPage() {
  const [params] = useSearchParams();
  const asked = params.get('state') as CeremonyStatus | null;
  const status = asked && STATES.includes(asked) ? asked : 'minting';
  const last = params.get('last') === '1';
  const model: CeremonyModel = {
    day: last ? 5 : 3,
    totalDays: 5,
    trailTitle: 'HTML',
    status,
    last,
    newMedals: status === 'minted' ? [{ key: 'streak_3', title: 'Streak 3', glyph: 'D3' }] : [],
    txSignature: status === 'minted' ? '5fixtureSignature' : null,
    assetAddress: status === 'minted' ? 'FixtureAsset1111' : null,
  };
  return <StampCeremony key={`${status}-${last}`} model={model} colorIndex={1} actions={<LessonCompleteActions nextLessonId="preview" />} />;
}
