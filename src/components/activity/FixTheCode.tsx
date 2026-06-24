import { Activity } from '@/types';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { ActivityGameCard } from '@/components/game';
import { GameButton } from '@/components/game';
import { useFixTheCode } from '@/hooks/useFixTheCode';
import { useI18n } from '@/i18n';

export interface FixTheCodeProps {
  activity: Activity;
  onSubmit: (fixedCode: string) => void;
}

export function FixTheCode({ activity, onSubmit }: FixTheCodeProps) {
  const { t } = useI18n();
  const { code, setCode, handleSubmit } = useFixTheCode(activity, { onSubmit });

  return (
    <ActivityGameCard
      type={activity.type}
      title={activity.title}
      question={t('activity.fixcode.instruction')}
      actions={
        <GameButton onClick={handleSubmit} variant="primary">
          {t('activity.submit')}
        </GameButton>
      }
    >
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[70%] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              value={code}
              onChange={setCode}
              language="typescript"
              fontSize={14}
            />
          </div>
        </div>

        <div className="w-[30%] pl-4 overflow-auto">
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
            {activity.instructions}
          </div>
        </div>
      </div>
    </ActivityGameCard>
  );
}
