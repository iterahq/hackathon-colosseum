/**
 * One generated option. The AI's pre-computed reply (`ai_response`) is the
 * teaching payload, so it stays hidden until the learner has committed — showing
 * it up front would answer the question for them.
 */
import { CheckCircle2, XCircle } from 'lucide-react';
import { t as localized } from '@iterahq/activity-spec/runtime';
import type { Locale } from '@iterahq/activity-spec/runtime';
import type { GeneratedOption } from '@iterahq/activity-spec';
import { useI18n } from '@/i18n';
import { BYOC_TONE_CLASS, type OptionTone } from '@/consts/byocTone';

export function ByocOptionCard({
  option,
  tone,
  revealResponse,
  children,
}: {
  option: GeneratedOption;
  tone: OptionTone;
  revealResponse: boolean;
  /** Interaction-specific controls (the judge_each good/bad pair). */
  children?: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <div
      data-testid="byoc-option"
      data-tone={tone}
      className={`rounded-2xl border px-5 py-4 transition-colors ${BYOC_TONE_CLASS[tone]}`}
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 min-w-0 whitespace-normal break-words text-left">
          {localized(option.content, locale as Locale)}
        </p>
        {tone === 'correct' && <CheckCircle2 className="w-5 h-5 text-menta flex-shrink-0" />}
        {tone === 'wrong' && <XCircle className="w-5 h-5 text-destructive flex-shrink-0" />}
      </div>

      {children}

      {revealResponse && (
        <div className="mt-3 rounded-xl bg-muted/40 px-4 py-3" data-testid="byoc-ai-response">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t('byoc.aiResponse')}
          </p>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
            {localized(option.ai_response, locale as Locale)}
          </p>
        </div>
      )}
    </div>
  );
}
