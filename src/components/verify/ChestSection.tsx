import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CHEST_TIERS, ODDS_TABLE } from '../../../supabase/functions/_shared/tera-roll';
import { ChainProof } from '@/components/chain/ChainProof';
import { CodeBlock, RawField, RawFields } from '@/components/chain/RawParts';
import { Bullets, P, RunButton, Steps, TextInput, VerifySection } from '@/components/verify/VerifyParts';
import { useTeraCatalog } from '@/hooks/useTeraCatalog';
import { useI18n } from '@/i18n';
import { recomputeFromChain, type ChestRecomputed, type RecomputeFailure } from '@/lib/chain/chestRecompute';
import { SAMPLE_CHEST } from '@/lib/chain/samples';
import { getChest } from '@/services/teraChest.service';
import type { Chest, ChestRecompute } from '@/types/tera';

const CELL = 'border-t border-[#2E2A25] px-2 py-2 text-right [font:500_12px_JetBrains_Mono] tabular-nums text-[#C9BFB0]';
const HEAD = 'px-2 py-2 text-right [font:600_10px/1.3_JetBrains_Mono] uppercase tracking-wider text-[#8F8779]';
const SUBTITLE = "[font:700_18px/1.2_'Barlow_Condensed'] text-[#F4EDE2]";
const TAG = 'ml-1.5 inline-block whitespace-nowrap rounded-full border px-1.5 py-[1px] [font:600_9px_JetBrains_Mono] uppercase tracking-[.08em]';
const LEVELS = Object.keys(ODDS_TABLE).map(Number).sort((a, b) => a - b) as Array<keyof typeof ODDS_TABLE>;

type Outcome =
  | { state: 'done'; chest: Chest; recompute: ChestRecompute; result: ChestRecomputed }
  | { state: 'failed'; chest: Chest | null; reason: RecomputeFailure | 'not_found' | 'not_settled' | 'unreachable' };

function Source({ chain }: { chain: boolean }) {
  const { t } = useI18n();
  return <span className={`${TAG} ${chain ? 'border-[#3FD17F] text-[#3FD17F]' : 'border-[#5E574E] text-[#A0978A]'}`}>{t(chain ? 'verify.chest.from.chain' : 'verify.chest.from.itera')}</span>;
}

/** The odds of each tier, in parts of 10 000, by effort level: the same table the roll reads. */
function OddsTable() {
  const { t, locale } = useI18n();
  const catalog = useTeraCatalog();
  const name = (tier: string) => catalog.tiers.find((entry) => entry.rarity === tier)?.tierName[locale] ?? tier;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#2E2A25]" data-testid="chest-odds">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} text-left`}>{t('verify.chest.odds.level')}</th>
            {CHEST_TIERS.map((tier) => (
              <th key={tier} scope="col" className={HEAD}>{name(tier)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((level) => (
            <tr key={level}>
              <th scope="row" className={`${CELL} text-left text-[#F4EDE2]`}>{level}</th>
              {CHEST_TIERS.map((tier) => (
                <td key={tier} className={CELL}>{ODDS_TABLE[level][tier]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reads the chest from Itera's public route, the chain from a public node, and rolls again with the server's own roll file. */
async function check(id: string): Promise<Outcome> {
  let read: Awaited<ReturnType<typeof getChest>>;
  try {
    read = await getChest(id);
  } catch {
    return { state: 'failed', chest: null, reason: 'unreachable' };
  }
  if (!read) return { state: 'failed', chest: null, reason: 'not_found' };
  const { chest, recompute } = read;
  if (!recompute || !chest.commit || chest.status !== 'minted') return { state: 'failed', chest, reason: 'not_settled' };
  try {
    const outcome = await recomputeFromChain({ certification: chest.certification, day: chest.day, commitTx: chest.commit.tx, teraKey: chest.tera?.key ?? null, tier: chest.tier, poolDocument: recompute.poolDocument, unavailable: recompute.unavailable });
    return 'result' in outcome ? { state: 'done', chest, recompute, result: outcome.result } : { state: 'failed', chest, reason: outcome.error };
  } catch {
    return { state: 'failed', chest, reason: 'unreachable' };
  }
}

function Recompute() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const asked = params.get('chest')?.trim() ?? '';
  const [value, setValue] = useState(asked || SAMPLE_CHEST);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const run = async (id: string) => {
    setBusy(true);
    setOutcome(null);
    setOutcome(await check(id));
    setBusy(false);
  };
  // A chest linked from a lesson end or a Tera is rolled at once: the visitor came to see the answer.
  useEffect(() => {
    if (asked) void run(asked);
  }, [asked]);
  const done = outcome?.state === 'done' ? outcome : null;
  const tera = outcome?.chest?.tera ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#2E2A25] bg-[#141210] p-4" data-testid="chest-recompute">
      <h3 className="[font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{t('verify.chest.try.title')}</h3>
      <p className={P}>{t('verify.chest.try.intro')}</p>
      <TextInput label={t('verify.chest.try.input')} value={value} onChange={setValue} />
      <RunButton label={t('verify.chest.try.run')} busyLabel={t('verify.chest.try.running')} busy={busy} disabled={value.trim() === ''} onClick={() => void run(value.trim())} />
      {outcome?.state === 'failed' && (
        <p role="alert" className="[font:600_14px/1.45_Inter] text-[#F2C66D]" data-testid="chest-recompute-failed" data-reason={outcome.reason}>
          {t(`verify.chest.fail.${outcome.reason}`)}
        </p>
      )}
      {done && (
        <div className="flex min-w-0 flex-col gap-3" role="status" data-testid="chest-recompute-result" data-agrees={String(done.result.agrees)} data-key={done.result.key}>
          <div className="flex min-w-0 items-center gap-3">
            {tera && <img src={tera.thumbUrl} alt="" className="h-14 w-14 shrink-0 rounded-full bg-[#0A0908] object-cover" />}
            <p className={`min-w-0 [font:700_16px/1.4_Inter] ${done.result.agrees ? 'text-[#3FD17F]' : 'text-[#F2C66D]'}`}>
              {done.result.agrees ? t('verify.chest.same', { tera: tera?.title ?? done.result.key, tier: tera?.tierName ?? done.result.tier }) : t('verify.chest.differs', { got: done.result.key, said: tera?.key ?? '?' })}
            </p>
          </div>
          <RawFields>
            <RawField label={t('verify.chest.field.commit')}>
              {done.result.commit}
              <Source chain />
            </RawField>
            <RawField label={t('verify.chest.field.order')}>
              {t('verify.chest.field.orderValue', { tx: done.result.commitTxSlot, target: done.result.targetSlot })}
              <Source chain />
            </RawField>
            <RawField label={t('verify.chest.field.block')}>
              {done.result.seedSlot} · {done.result.blockhash}
              <Source chain />
            </RawField>
            <RawField label={t('verify.chest.field.seed')}>{done.result.seed}</RawField>
            <RawField label={t('verify.chest.field.level')}>
              {done.result.level}
              <Source chain />
            </RawField>
            {done.chest.odds.length > 0 && (
              <RawField label={t('verify.chest.field.odds')} testId="chest-committed-odds">
                {done.chest.odds.map((entry) => `${entry.tier} ${entry.weight}`).join(' · ')}
                <Source chain={false} />
              </RawField>
            )}
            <RawField label={t('verify.chest.field.pool')}>
              {t('verify.chest.field.poolValue')}
              <Source chain={false} />
            </RawField>
            <RawField label={t('verify.chest.field.held')}>
              {done.recompute.unavailable.length === 0 ? t('verify.chest.field.heldNone') : done.recompute.unavailable.join(', ')}
              <Source chain={false} />
            </RawField>
          </RawFields>
          <CodeBlock label={t('verify.chest.steps')}>{done.result.steps.join('\n')}</CodeBlock>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <span className={P}>{t('verify.chest.open.cert')}</span>
            <ChainProof kind="address" value={done.chest.certification} />
          </div>
          {done.chest.commit && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <span className={P}>{t('verify.chest.open.tx')}</span>
              <ChainProof kind="tx" value={done.chest.commit.tx} />
            </div>
          )}
          {tera?.asset && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <span className={P}>{t('verify.chest.open.tera')}</span>
              <ChainProof kind="address" value={tera.asset} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** /verify: how the chest of a stamped day picks its Tera, and the same roll done again in the visitor's browser. */
export function ChestSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="chest" title={t('verify.chest.title')}>
      <p className={P}>{t('verify.chest.intro')}</p>
      <Recompute />
      <h3 className={SUBTITLE}>{t('verify.chest.formula.title')}</h3>
      <Steps items={[t('verify.chest.formula.1'), t('verify.chest.formula.2'), t('verify.chest.formula.3'), t('verify.chest.formula.4')]} />
      <h3 className={SUBTITLE}>{t('verify.chest.inputs.title')}</h3>
      <Bullets items={[t('verify.chest.inputs.chain'), t('verify.chest.inputs.pool'), t('verify.chest.inputs.held'), t('verify.chest.inputs.effort')]} />
      <h3 className={SUBTITLE}>{t('verify.chest.odds.title')}</h3>
      <p className={P}>{t('verify.chest.odds.intro')}</p>
      <OddsTable />
      <p className={P}>{t('verify.chest.limits')}</p>
    </VerifySection>
  );
}
