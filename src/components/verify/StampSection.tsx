import { Bullets, P, VerifySection } from '@/components/verify/VerifyParts';
import { useI18n } from '@/i18n';

const ROWS = ['choice', 'fill', 'editor', 'style', 'scene', 'read'] as const;
const CELL = 'border-t border-[#2E2A25] px-3 py-2.5 align-top [font:400_13px/1.5_Inter] text-[#C9BFB0]';
const HEAD = 'px-3 py-2 text-left [font:600_11px/1.4_JetBrains_Mono] uppercase tracking-wider text-[#8F8779]';
const SUBTITLE = "[font:700_18px/1.2_'Barlow_Condensed'] text-[#F4EDE2]";

/** /verify: which answers the server grades, which the browser reports, and the tables a stamp reads. */
export function StampSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="stamp" title={t('verify.stamp.title')}>
      <p className={P}>{t('verify.stamp.intro')}</p>
      <div className="overflow-x-auto rounded-xl border border-[#2E2A25]" data-testid="verify-stamp-table">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className={HEAD}>{t('verify.stamp.col.kind')}</th>
              <th scope="col" className={HEAD}>{t('verify.stamp.col.browser')}</th>
              <th scope="col" className={HEAD}>{t('verify.stamp.col.judge')}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row}>
                <th scope="row" className={`${CELL} text-left font-semibold text-[#F4EDE2]`}>{t(`verify.stamp.${row}.kind`)}</th>
                <td className={CELL}>{t(`verify.stamp.${row}.browser`)}</td>
                <td className={CELL}>{t(`verify.stamp.${row}.judge`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className={SUBTITLE}>{t('verify.stamp.tables.title')}</h3>
      <Bullets items={[t('verify.stamp.tables.progress'), t('verify.stamp.tables.attempts'), t('verify.stamp.tables.results'), t('verify.stamp.tables.trace')]} />
      <h3 className={SUBTITLE}>{t('verify.stamp.limits.title')}</h3>
      <Bullets items={[t('verify.stamp.limits.guess'), t('verify.stamp.limits.browser'), t('verify.stamp.limits.who')]} />
      <p className={P}>{t('verify.stamp.script')}</p>
    </VerifySection>
  );
}
