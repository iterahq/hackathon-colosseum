import { useSearchParams } from 'react-router-dom';
import { LessonCompleteActions } from '@/components/branded/lesson/LessonCompleteCard';
import { StampCeremony } from '@/components/passport/StampCeremony';
import { DayChest } from '@/components/tera/DayChest';
import { toChest } from '@/services/teraChest.service';
import { WIRE_CHEST_COMMITTED, WIRE_CHEST_MINTED, WIRE_CHEST_ROLLING } from '@/services/teraChestMock';
import type { CeremonyStatus } from '@/types/achievements';
import type { CeremonyModel } from '@/utils/ceremony';

const STATES: readonly CeremonyStatus[] = ['minting', 'minted', 'failed', 'no_wallet', 'pending'];

/** Dev-only: every ceremony state from fixtures, no backend. `?state=minting|minted|failed|no_wallet|pending&last=0|1&preparing=0|1&chest=sealing|committed|rolling|revealed&tier=<rarity>`. */
export default function CeremonyPreviewPage() {
  const [params] = useSearchParams();
  const asked = params.get('state') as CeremonyStatus | null;
  const status = asked && STATES.includes(asked) ? asked : 'minting';
  const last = params.get('last') === '1';
  const preparing = params.get('preparing') === '1';
  const model: CeremonyModel = {
    day: last ? 5 : 3,
    daysDone: last ? 5 : 3,
    totalDays: 5,
    trailTitle: 'HTML',
    status,
    last,
    newMedals: status === 'minted' && params.get('medal') !== '0' ? [{ key: 'early', title: 'Early bird', glyph: 'EB', kind: 'milestone', credentialId: null }, { key: 'first', title: 'First stamp', glyph: 'D1', kind: 'milestone', credentialId: null }] : [],
    txSignature: status === 'minted' ? '5fixtureSignature' : null,
    assetAddress: status === 'minted' ? 'FixtureAsset1111' : null,
  };
  const phase = params.get('chest');
  const TIER_NAMES: Record<string, string> = { common: 'Tera', rare: 'Super Tera', epic: 'Mega Tera', legendary: 'Legendary Tera', mythic: 'Mythic Tera', primordial: 'Primordial Tera' };
  const tier = params.get('tier') ?? WIRE_CHEST_MINTED.tier;
  const wire = phase === 'revealed' ? { ...WIRE_CHEST_MINTED, tier, tera: { ...WIRE_CHEST_MINTED.tera, rarity: tier, tier_name: TIER_NAMES[tier] ?? 'Tera' } } : phase === 'rolling' ? WIRE_CHEST_ROLLING : phase === 'committed' ? WIRE_CHEST_COMMITTED : null;
  const chest = phase === 'sealing' || wire ? <DayChest phase={phase as 'sealing'} chest={wire ? toChest(wire) : null} day={model.day} size={params.get('size') === 'hero' ? 'hero' : 'row'} /> : undefined;
  return <StampCeremony key={`${status}-${last}-${preparing}`} model={model} preparing={preparing} colorIndex={1} chest={chest} compact={Boolean(chest)} chestFocus={params.get('size') === 'hero'} actions={<LessonCompleteActions nextLessonId="preview" gold={last && !preparing} />} />;
}
