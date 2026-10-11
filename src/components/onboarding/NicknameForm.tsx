import { useState, type FormEvent } from 'react';
import { TeraAvatar } from '@iterahq/activities';
import { useI18n } from '@/i18n';
import { NICKNAME_MAX, normalizeNickname } from '@/utils/nicknameGate';

interface NicknameFormProps {
  saving: boolean;
  happy: boolean;
  /** An e-mail account is told the nickname replaces its address on screen; a wallet account that its wallet stays its public identity. */
  helperKey?: string;
  onSubmit: (nickname: string) => void;
  onSkip: () => void;
}

/** The question with its answer checked as it is typed: Continue stays off until the name is valid, and the reason is on screen. */
export function NicknameForm({ saving, happy, helperKey = 'tera.nickname.helper', onSubmit, onSkip }: NicknameFormProps) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const result = normalizeNickname(value);
  const error = value.trim() !== '' && result.ok === false ? result.reason : null;
  const valid = result.ok;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (result.ok === false) return;
    onSubmit(result.value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-5 px-6 text-center"
    >
      <TeraAvatar mood={happy ? 'happy' : 'neutral'} size="xl" />
      <h1 id="nickname-gate-title" className="[font:700_40px/1_'Barlow_Condensed'] tracking-[.02em] text-[#F4EDE2]">
        {t('tera.nickname.title')}
      </h1>
      <div className="flex w-full flex-col gap-2 text-left">
        <input
          data-testid="nickname-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('tera.nickname.placeholder')}
          aria-label={t('tera.nickname.placeholder')}
          aria-invalid={error ? 'true' : 'false'}
          maxLength={NICKNAME_MAX * 2}
          autoFocus
          autoComplete="nickname"
          className="h-[52px] w-full rounded-xl border border-[#262320] bg-[#141210] px-4 text-[18px] text-[#F4EDE2] placeholder:text-[#A0978A] focus:border-[#3FD17F] focus:outline-none"
        />
        {error && (
          <p role="alert" data-testid="nickname-error" className="[font:500_13px_JetBrains_Mono] text-[#F2A07B]">
            {t(`tera.nickname.error.${error}`)}
          </p>
        )}
        <p className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t(helperKey)}</p>
      </div>
      <button
        type="submit"
        data-testid="nickname-submit"
        disabled={saving || !valid}
        aria-disabled={saving || !valid}
        className="h-[60px] w-full rounded-xl border-0 border-b-[6px] border-b-[#2A9B5A] bg-[#3FD17F] text-[#0A0908] [font:700_26px_'Barlow_Condensed'] transition-transform duration-75 active:translate-y-[5px] active:border-b-[1px] disabled:opacity-60"
      >
        {t('tera.nickname.submit')}
      </button>
      <button
        type="button"
        data-testid="nickname-skip"
        onClick={onSkip}
        className="h-[52px] w-full rounded-xl border border-[#2E2A25] border-b-[4px] bg-[#141210] text-[#F4EDE2] [font:700_20px_'Barlow_Condensed'] hover:border-[#5E574E]"
      >
        {t('tera.nickname.skip')}
      </button>
    </form>
  );
}
