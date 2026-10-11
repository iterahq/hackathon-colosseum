import { CurlLine } from '@/components/chain/RawParts';
import { Labelled, P, VerifySection } from '@/components/verify/VerifyParts';
import { useProgramData } from '@/hooks/useProgramData';
import { useI18n } from '@/i18n';
import { PROGRAM_DATA_HEADER_BYTES } from '@/lib/chain/programData';
import { accountParams, curlFor, transactionParams } from '@/lib/chain/rpc';
import { SAMPLE_ASSET, SAMPLE_ESCROW } from '@/lib/chain/samples';

export function RpcSection() {
  const { t } = useI18n();
  const { dataAddress } = useProgramData();
  const slice = { offset: 0, length: PROGRAM_DATA_HEADER_BYTES };
  return (
    <VerifySection id="rpc" title={t('verify.rpc.title')}>
      <p className={P}>{t('verify.rpc.intro')}</p>
      <Labelled label={t('verify.rpc.asset')}>
        <CurlLine command={curlFor('getAccountInfo', accountParams(SAMPLE_ASSET))} />
      </Labelled>
      <Labelled label={t('verify.rpc.escrow')}>
        <CurlLine command={curlFor('getAccountInfo', accountParams(SAMPLE_ESCROW))} />
      </Labelled>
      <Labelled label={t('verify.rpc.header')}>
        <CurlLine command={curlFor('getAccountInfo', accountParams(dataAddress ?? '<program data account>', slice))} />
      </Labelled>
      {!dataAddress && <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.rpc.headerHint')}</p>}
      <Labelled label={t('verify.rpc.transaction')}>
        <CurlLine command={curlFor('getTransaction', transactionParams('<signature>'))} />
      </Labelled>
    </VerifySection>
  );
}
